#!/usr/bin/env python3
"""
check-compose-ports: reject non-loopback port publishes in docker-compose.yml.

Services bound to 0.0.0.0 are reachable from the public internet via Docker's
iptables rules, which bypass UFW. Loopback-only publishes (127.0.0.1) are safe
for admin-style host access. Infra services (db/cache/queue) must never be
exposed publicly — see the 2026-04-11 Redis incident.

Allowed host bindings: 127.0.0.1, [::1], localhost
Rejected: empty host_ip, 0.0.0.0, [::], public IPs, bare int ports
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("error: PyYAML required (pip install pyyaml)", file=sys.stderr)
    sys.exit(2)

LOOPBACK = re.compile(r"^(127\.0\.0\.1|\[::1\]|localhost):")


def check_port(service: str, port) -> str | None:
    if isinstance(port, int):
        return f"{service}: {port} (bare int — binds to 0.0.0.0)"
    if isinstance(port, str):
        if LOOPBACK.match(port):
            return None
        return f"{service}: '{port}' (no loopback prefix)"
    if isinstance(port, dict):
        host_ip = (port.get("host_ip") or "").strip()
        target = port.get("target", "?")
        published = port.get("published", "?")
        if host_ip in ("127.0.0.1", "::1", "localhost"):
            return None
        return f"{service}: {published}:{target} (host_ip={host_ip or '<empty>'})"
    return f"{service}: unexpected port entry {port!r}"


def main(path: str) -> int:
    data = yaml.safe_load(Path(path).read_text()) or {}
    services = data.get("services", {}) or {}
    errors = []
    for name, cfg in services.items():
        if not isinstance(cfg, dict):
            continue
        for port in cfg.get("ports") or []:
            err = check_port(name, port)
            if err:
                errors.append(err)
    if errors:
        print(f"ERROR: {path} publishes non-loopback port(s):", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        print("", file=sys.stderr)
        print("Fix: prefix with 127.0.0.1 (e.g. '127.0.0.1:8080:8000')", file=sys.stderr)
        print("  or use 'expose:' for in-cluster-only reach.", file=sys.stderr)
        print("  See project memory: SEET Redis intrusion 2026-04-11", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "docker-compose.yml"
    sys.exit(main(target))
