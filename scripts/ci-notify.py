#!/usr/bin/env python3
"""
ci-notify: send an email reporting Woodpecker pipeline status.

Usage: ci-notify.py <success|failure>

SMTP credentials are read from /home/ubuntu/SEET/.env (CI_SMTP_HOST,
CI_SMTP_PORT, CI_SMTP_USER, CI_SMTP_PASS, CI_NOTIFY_TO).

Pipeline context comes from Woodpecker's CI_* environment variables.
"""
from __future__ import annotations
import os
import smtplib
import ssl
import sys
from email.mime.text import MIMEText
from pathlib import Path


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip()
    return env


def main() -> int:
    status = sys.argv[1] if len(sys.argv) > 1 else "unknown"

    env = load_env(Path("/home/ubuntu/SEET/.env"))
    host = env["CI_SMTP_HOST"]
    port = int(env["CI_SMTP_PORT"])
    user = env["CI_SMTP_USER"]
    password = env["CI_SMTP_PASS"]
    recipient = env["CI_NOTIFY_TO"]

    sha = os.environ.get("CI_COMMIT_SHA", "unknown")[:8]
    branch = os.environ.get("CI_COMMIT_BRANCH", "unknown")
    author = os.environ.get("CI_COMMIT_AUTHOR", "unknown")
    commit_msg = (os.environ.get("CI_COMMIT_MESSAGE", "") or "").splitlines()
    commit_title = commit_msg[0] if commit_msg else ""
    pipeline_num = os.environ.get("CI_PIPELINE_NUMBER", "?")
    pipeline_url = os.environ.get("CI_PIPELINE_URL", "")
    repo = os.environ.get("CI_REPO_NAME", "seet")

    tag = "SUCCESS" if status == "success" else "FAILED"
    subject = f"[{repo}] Pipeline #{pipeline_num} on {branch} — {tag}"
    body = (
        f"Status:   {status}\n"
        f"Pipeline: #{pipeline_num}\n"
        f"Repo:     {repo}\n"
        f"Branch:   {branch}\n"
        f"Commit:   {sha}\n"
        f"Author:   {author}\n"
        f"Message:  {commit_title}\n"
        f"\n"
        f"URL: {pipeline_url}\n"
    )

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = user
    msg["To"] = recipient

    ctx = ssl.create_default_context()
    with smtplib.SMTP_SSL(host, port, context=ctx, timeout=15) as s:
        s.login(user, password)
        s.send_message(msg)

    print(f"notify: sent '{subject}' to {recipient}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
