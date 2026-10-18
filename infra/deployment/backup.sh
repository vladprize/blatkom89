#!/bin/sh
# Nightly pg_dump of the game database into /backups (custom format, compressed), with rotation.
# Used by the `backup` profile in docker-compose.yml. Restore: see docs/DEPLOYMENT.md.
set -eu
KEEP="${BACKUP_KEEP_DAYS:-14}"
while true; do
  STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
  FILE="/backups/blatkom-${STAMP}.dump"
  if pg_dump -h db -U blatkom -d blatkom -Fc -f "${FILE}.part"; then
    mv "${FILE}.part" "${FILE}"
    echo "backup ok: ${FILE}"
  else
    rm -f "${FILE}.part"
    echo "backup FAILED at ${STAMP}" >&2
  fi
  find /backups -name 'blatkom-*.dump' -mtime +"${KEEP}" -delete
  sleep 86400
done
