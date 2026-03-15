#!/bin/bash
# DCANT — Backup PostgreSQL quotidien
# Ajouter au crontab : 0 3 * * * /opt/dcant-api/scripts/backup.sh
# Conserve 7 jours de backups

BACKUP_DIR="/var/backups/dcant"
DB_NAME="dcant"
KEEP_DAYS=7

mkdir -p "$BACKUP_DIR"

DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="dcant_${DATE}.sql.gz"

pg_dump "$DB_NAME" | gzip > "${BACKUP_DIR}/${FILENAME}"

if [ $? -eq 0 ]; then
  echo "[BACKUP] OK: ${FILENAME}"
else
  echo "[BACKUP] ERREUR: pg_dump a échoué" >&2
  exit 1
fi

# Supprime les backups de plus de 7 jours
find "$BACKUP_DIR" -name "dcant_*.sql.gz" -mtime +${KEEP_DAYS} -delete
echo "[BACKUP] Nettoyage terminé (conserve ${KEEP_DAYS} jours)"
