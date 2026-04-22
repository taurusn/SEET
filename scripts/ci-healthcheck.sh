#!/bin/sh
# ci-healthcheck: verify the new deploy is actually serving traffic.
# POSIX-clean so it runs on Alpine sh (BusyBox) in the CI container.
#
# Two probes run in sequence:
#   1. api direct  — python -c urllib → http://localhost:8000/health inside
#                    the api container. Confirms FastAPI came up.
#   2. public path — curl via the host loopback → http://127.0.0.1/health,
#                    which goes through nginx. Confirms nginx is routing
#                    requests to api, so the Cloudflare tunnel will see 200.
#
# Both must pass or the pipeline fails — this turns "api came up but nginx
# is down" into a pipeline failure instead of a silent 502 outage.

set -euo pipefail

MAX_ATTEMPTS="${CI_HEALTHCHECK_ATTEMPTS:-15}"
DELAY="${CI_HEALTHCHECK_DELAY:-2}"
PROJECT="${CI_PROJECT:-seet}"

probe_api_direct() {
  docker compose -p "$PROJECT" exec -T api python -c "
import urllib.request, sys
try:
    r = urllib.request.urlopen('http://localhost:8000/health', timeout=3)
    sys.exit(0 if r.status == 200 else 1)
except Exception:
    sys.exit(1)
" 2>/dev/null
}

probe_public_path() {
  # Run curl from inside a throwaway container on the compose network so we
  # hit nginx by its service name (public port is 127.0.0.1-bound on host).
  docker run --rm --network "${PROJECT}_default" curlimages/curl:latest \
    -fsS -m 3 -o /dev/null http://nginx/health 2>/dev/null
}

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  if probe_api_direct; then
    if probe_public_path; then
      echo "healthcheck: api + nginx healthy on attempt $attempt/$MAX_ATTEMPTS"
      exit 0
    fi
    echo "healthcheck: api OK but nginx path failing ($attempt/$MAX_ATTEMPTS)"
  else
    echo "healthcheck: api not ready yet ($attempt/$MAX_ATTEMPTS)"
  fi
  sleep "$DELAY"
done

echo "healthcheck: never became healthy — inspect 'docker compose -p $PROJECT logs api nginx'"
exit 1
