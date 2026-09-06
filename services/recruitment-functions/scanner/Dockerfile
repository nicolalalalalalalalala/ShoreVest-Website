# ShoreVest recruitment CV malware scanner (self-hosted, free alternative to
# Microsoft Defender for Storage on-upload scanning).
#
# One container runs both the ClamAV daemon (clamd) and the Node scan worker, so
# every candidate CV is scanned entirely inside this container over localhost and
# is never sent to any third party. Deployed to Azure Container Apps with a KEDA
# queue scaler so it scales to zero when idle (fits the free monthly grant).
#
# Build from the REPOSITORY ROOT (the worker imports the shared core at
# api/recruitment/core, which lives outside this folder):
#   docker build -f services/recruitment-functions/scanner/Dockerfile \
#     -t <registry>/recruitment-clamav:<tag> .

FROM clamav/clamav:1.4_base

# Node.js runtime (the ClamAV image is Alpine-based).
RUN apk add --no-cache nodejs npm

WORKDIR /app

# Install production dependencies from the committed lockfile.
COPY services/recruitment-functions/package.json services/recruitment-functions/package-lock.json ./services/recruitment-functions/
RUN cd services/recruitment-functions && npm ci --omit=dev --ignore-scripts

# Application code and the shared recruitment core, placed at the same relative
# paths as in the repo so require('../../../../api/recruitment/core/...') resolves.
COPY services/recruitment-functions/src ./services/recruitment-functions/src
COPY --chmod=0755 services/recruitment-functions/scanner/entrypoint.sh ./services/recruitment-functions/scanner/entrypoint.sh
COPY api/recruitment ./api/recruitment

# clamd listens on localhost:3310 for the co-located worker only.
ENV CLAMAV_HOST=127.0.0.1 \
    CLAMAV_PORT=3310 \
    NODE_ENV=production

ENTRYPOINT ["/app/services/recruitment-functions/scanner/entrypoint.sh"]
