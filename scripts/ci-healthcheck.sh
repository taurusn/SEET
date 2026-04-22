#!/bin/bash
# ci-healthcheck: poll /health inside the API container until it answers 200.
#
# Fails the pipeline if the new container never comes up cleanly, instead of
# letting Woodpecker declare success on a silently-broken deploy.
#
# Uses the api container's own Python (no curl dependency). Runs on the
# internal port 8000 so we don't accidentally pass via nginx caching.

set -euo pipefail

MAX_ATTEMPTS="${CI_HEALTHCHECK_ATTEMPTS:-15}"
DELAY="${CI_HEALTHCHECK_DELAY:-2}"
PROJECT="${CI_PROJECT:-seet}"

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  if docker compose -p "$PROJECT" exec -T api python -c "
import urllib.request, sys
try:
    r = urllib.request.urlopen('http://localhost:8000/health', timeout=3)
    sys.exit(0 if r.status == 200 else 1)
except Exception:
    sys.exit(1)
" 2>/dev/null; then
    echo "healthcheck: API healthy on attempt $attempt/$MAX_ATTEMPTS"
    exit 0
  fi
  echo "healthcheck: not ready yet ($attempt/$MAX_ATTEMPTS), waiting ${DELAY}s..."
  sleep "$DELAY"
done

echo "healthcheck: API never became healthy — inspect 'docker compose -p $PROJECT logs api'"
exit 1
