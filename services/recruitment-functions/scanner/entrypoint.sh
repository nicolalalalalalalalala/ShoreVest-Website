#!/bin/sh
# Starts clamd (+ freshclam) via the ClamAV base image's own init, waits until
# clamd answers PINGs (virus definitions loaded), then launches the scan worker.
set -eu

# The clamav/clamav base image init script starts freshclam and clamd. Run it in
# the background so we can start the worker in the same container.
if [ -x /init ]; then
  /init &
elif [ -x /init-unprivileged ]; then
  /init-unprivileged &
else
  # Fallback: start the daemons directly.
  freshclam --quiet || true
  clamd &
fi

CLAMAV_HOST="${CLAMAV_HOST:-127.0.0.1}"
CLAMAV_PORT="${CLAMAV_PORT:-3310}"

echo "waiting for clamd at ${CLAMAV_HOST}:${CLAMAV_PORT} (loading virus definitions)..."
i=0
until node -e "const {createClamAvScanner}=require('/app/services/recruitment-functions/src/lib/clamav');createClamAvScanner({host:process.env.CLAMAV_HOST,port:Number(process.env.CLAMAV_PORT)}).ping().then(ok=>process.exit(ok?0:1)).catch(()=>process.exit(1))"; do
  i=$((i + 1))
  if [ "$i" -gt 180 ]; then
    echo "clamd did not become ready within timeout" >&2
    exit 1
  fi
  sleep 2
done
echo "clamd is ready; starting scan worker"

exec node /app/services/recruitment-functions/src/scan/worker.js
