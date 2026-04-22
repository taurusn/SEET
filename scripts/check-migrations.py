#!/usr/bin/env python3
"""
check-migrations: enforce expand/contract migration safety rules.

Every migration has to be safe to apply while the PREVIOUS version of the
code is still running. If a migration breaks that, a mid-deploy failure or
a slow container rollout means the old API is reading a schema it doesn't
understand. This script blocks the PR before that can happen.

Rules enforced:
  R1  No op.drop_column          — the old code may still read it.
                                    Ship a migration that stops WRITING it
                                    first, wait one deploy, THEN drop.
  R2  No op.drop_table           — same reason.
  R3  No op.rename_column        — split into add-new, copy, deploy, drop-old.
  R4  No op.rename_table         — same.
  R5  No alter_column nullable=False without server_default
                                 — inserts from old code will fail mid-deploy.
  R6  downgrade() must not be empty / pass / NotImplementedError
                                 — needed for manual rollback.

Escape hatch:
    Add `# safe-migration` to the offending line (or the line above it) to
    signal "I read the rules and this is safe." Reviewer responsibility,
    not silent.

Exit code:
    0  — all good
    1  — one or more violations (details on stderr)

Usage:
    python3 scripts/check-migrations.py [MIGRATIONS_DIR]
    # defaults to alembic/versions/
"""
from __future__ import annotations

import ast
import pathlib
import sys
from dataclasses import dataclass

DEFAULT_DIR = pathlib.Path("alembic/versions")
ESCAPE_MARKER = "safe-migration"

DANGEROUS_CALLS = {
    "drop_column": "R1: dropping a column breaks rolling deploys (old code still reads it). Split into stop-writing migration first.",
    "drop_table": "R2: dropping a table breaks rolling deploys. Stop using it in code first, deploy, then drop.",
    "rename_column": "R3: rename is not atomic with code changes. Add new column, copy, deploy, drop old.",
    "rename_table": "R4: rename is not atomic with code changes. Add new table, dual-write, deploy, drop old.",
}


@dataclass
class Violation:
    file: pathlib.Path
    line: int
    rule: str
    detail: str


def _has_escape(src_lines: list[str], line_no: int) -> bool:
    """Return True if the offending line carries the `# safe-migration`
    marker inline, OR the comment block immediately above it does.

    A comment block is consecutive lines starting with `#` (possibly
    indented), stopping at the first non-comment non-blank line."""
    idx = line_no - 1
    if 0 <= idx < len(src_lines) and ESCAPE_MARKER in src_lines[idx]:
        return True
    # Walk upward through contiguous comment/blank lines
    i = idx - 1
    while i >= 0:
        stripped = src_lines[i].lstrip()
        if stripped.startswith("#"):
            if ESCAPE_MARKER in stripped:
                return True
            i -= 1
            continue
        if stripped == "":
            i -= 1
            continue
        break
    return False


def _call_name(node: ast.Call) -> str | None:
    """Extract the function name from `op.<name>(...)` calls."""
    func = node.func
    if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name):
        if func.value.id == "op":
            return func.attr
    return None


def _kwarg_value(call: ast.Call, name: str) -> ast.expr | None:
    for kw in call.keywords:
        if kw.arg == name:
            return kw.value
    return None


def _is_literal_false(node: ast.expr | None) -> bool:
    return isinstance(node, ast.Constant) and node.value is False


def _is_empty_function(func: ast.FunctionDef) -> bool:
    """True if the function body is only `pass`, a raise NotImplementedError,
    or a lone docstring — i.e. it doesn't actually reverse the migration."""
    body = func.body
    # Strip leading docstring
    if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) and isinstance(body[0].value.value, str):
        body = body[1:]
    if not body:
        return True
    if len(body) == 1:
        only = body[0]
        if isinstance(only, ast.Pass):
            return True
        if isinstance(only, ast.Raise):
            exc = only.exc
            if isinstance(exc, ast.Call) and isinstance(exc.func, ast.Name) and exc.func.id in {"NotImplementedError", "RuntimeError"}:
                return True
            if isinstance(exc, ast.Name) and exc.id in {"NotImplementedError"}:
                return True
    return False


def _inspect_upgrade_body(
    path: pathlib.Path, func: ast.FunctionDef, src_lines: list[str]
) -> list[Violation]:
    """Apply R1–R5 to the body of an upgrade() function only.

    Destructive ops inside downgrade() are expected — that IS the rollback.
    """
    violations: list[Violation] = []
    for node in ast.walk(func):
        if not isinstance(node, ast.Call):
            continue
        name = _call_name(node)
        if name is None:
            continue

        if name in DANGEROUS_CALLS:
            if not _has_escape(src_lines, node.lineno):
                violations.append(
                    Violation(path, node.lineno, name, DANGEROUS_CALLS[name])
                )

        if name == "alter_column":
            nullable = _kwarg_value(node, "nullable")
            if _is_literal_false(nullable):
                default = _kwarg_value(node, "server_default")
                if default is None and not _has_escape(src_lines, node.lineno):
                    violations.append(
                        Violation(
                            path, node.lineno, "alter_column_not_null",
                            "R5: setting nullable=False without server_default breaks "
                            "inserts from old code mid-deploy. Add a server_default, "
                            "or do it in two migrations."
                        )
                    )

        if name == "add_column":
            column_expr = None
            if len(node.args) >= 2 and isinstance(node.args[1], ast.Call):
                column_expr = node.args[1]
            col_kwarg = _kwarg_value(node, "column")
            if isinstance(col_kwarg, ast.Call):
                column_expr = col_kwarg
            if column_expr is not None:
                nullable = _kwarg_value(column_expr, "nullable")
                default = _kwarg_value(column_expr, "server_default")
                if _is_literal_false(nullable) and default is None and not _has_escape(src_lines, node.lineno):
                    violations.append(
                        Violation(
                            path, node.lineno, "add_column_not_null",
                            "R5: adding a NOT NULL column without server_default "
                            "fails on existing rows. Make it nullable first, "
                            "backfill, then tighten."
                        )
                    )

    return violations


def check_file(path: pathlib.Path) -> list[Violation]:
    """Return all rule violations found in a single migration file."""
    source = path.read_text()
    src_lines = source.splitlines()
    violations: list[Violation] = []

    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as e:
        violations.append(Violation(path, e.lineno or 0, "parse-error", str(e)))
        return violations

    # Only inspect top-level upgrade() / downgrade() defs, not nested helpers.
    for node in tree.body:
        if not isinstance(node, ast.FunctionDef):
            continue
        if node.name == "upgrade":
            violations.extend(_inspect_upgrade_body(path, node, src_lines))
        elif node.name == "downgrade":
            if _is_empty_function(node) and not _has_escape(src_lines, node.lineno):
                violations.append(
                    Violation(
                        path, node.lineno, "empty_downgrade",
                        "R6: downgrade() is empty / pass / NotImplementedError. "
                        "Needed for manual rollback — fill it in, or add "
                        "`# safe-migration` on the def line if truly irreversible."
                    )
                )

    return violations


def main(argv: list[str]) -> int:
    root = pathlib.Path(argv[1]) if len(argv) > 1 else DEFAULT_DIR
    if not root.is_dir():
        print(f"check-migrations: {root} is not a directory", file=sys.stderr)
        return 1

    files = sorted(p for p in root.glob("*.py") if p.name != "__init__.py")
    all_violations: list[Violation] = []
    for f in files:
        all_violations.extend(check_file(f))

    if not all_violations:
        print(f"check-migrations: {len(files)} migration(s) passed")
        return 0

    print(f"check-migrations: {len(all_violations)} violation(s) found", file=sys.stderr)
    for v in all_violations:
        print(f"  {v.file}:{v.line}  [{v.rule}]  {v.detail}", file=sys.stderr)
    print(
        "\nIf a violation is genuinely safe, add `# safe-migration` on the "
        "offending line to acknowledge.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
