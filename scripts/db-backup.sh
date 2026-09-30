#!/bin/sh
# Automatic Postgres backups for the local dev stack - runs inside the "db-backup" sidecar
# (docker-compose.yml). The stack is started at random times, so this is deliberately NOT a
# cron-style schedule: it dumps once right after the database becomes reachable (i.e. on every
# stack start) and then every BACKUP_INTERVAL_HOURS while the stack keeps running. start.ps1 also
# triggers `db-backup.sh once` right before stopping the stack. See the global CLAUDE.md,
# "Database backups for local Docker Compose stacks".
#
#   db-backup.sh          -> loop mode (default: sidecar entrypoint)
#   db-backup.sh once     -> one dump, then exit
#
# Layout under $BACKUP_DIR (a bind mount to the host, NOT a Docker volume - a deleted volume must
# never take its own backups with it):
#   recent/  newest $BACKUP_KEEP_RECENT dumps (default 20)
#   daily/   first dump of each day, kept $BACKUP_KEEP_DAILY_DAYS days (default 60)
#
# A dump is only kept if the database content actually changed since the last one (compared via a
# hash of the plain-SQL dump). Without that, an empty/fresh database after data loss would keep
# producing identical dumps that rotate the last GOOD backups out of "recent".
set -u

BACKUP_DIR="${BACKUP_DIR:-/backups}"
INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-6}"
KEEP_RECENT="${BACKUP_KEEP_RECENT:-20}"
KEEP_DAILY_DAYS="${BACKUP_KEEP_DAILY_DAYS:-60}"
PREFIX="${BACKUP_PREFIX:-milepoint}"

RECENT="$BACKUP_DIR/recent"
DAILY="$BACKUP_DIR/daily"
HASH_FILE="$BACKUP_DIR/.last-hash"
mkdir -p "$RECENT" "$DAILY"

log() { echo "[db-backup $(date '+%Y-%m-%d %H:%M:%S')] $*"; }

wait_for_db() {
  tries=0
  until pg_isready -q; do
    tries=$((tries + 1))
    if [ "$tries" -ge 60 ]; then log "Datenbank nach 10 Minuten nicht erreichbar - gebe fuer diesen Durchlauf auf."; return 1; fi
    sleep 10
  done
}

dump_once() {
  wait_for_db || return 1

  # pg_dump 17.6+/18 writes a random `\restrict <key>` ... `\unrestrict <key>` pair into every plain
  # dump (a psql-injection hardening), which makes two dumps of identical data hash differently -
  # strip those two lines or the "unchanged since last backup" check below never fires.
  new_hash="$(pg_dump --no-owner --format=plain 2>/dev/null | grep -v -e '^\\restrict ' -e '^\\unrestrict ' | sha256sum | cut -d' ' -f1)"
  if [ -z "$new_hash" ]; then log "FEHLER: pg_dump (plain) lieferte nichts."; return 1; fi
  if [ -f "$HASH_FILE" ] && [ "$(cat "$HASH_FILE")" = "$new_hash" ]; then
    log "Keine Aenderung seit der letzten Sicherung - uebersprungen."
    return 0
  fi

  ts="$(date '+%Y%m%d-%H%M%S')"
  tmp="$RECENT/.tmp-$ts.dump"
  if ! pg_dump --no-owner --format=custom --file="$tmp"; then
    rm -f "$tmp"
    log "FEHLER: pg_dump (custom) fehlgeschlagen - keine Sicherung angelegt."
    return 1
  fi
  # Refuse to keep a file pg_restore can't even read the table of contents of.
  if ! pg_restore --list "$tmp" >/dev/null 2>&1; then
    rm -f "$tmp"
    log "FEHLER: Sicherung ist nicht lesbar - verworfen."
    return 1
  fi

  final="$RECENT/$PREFIX-$ts.dump"
  mv "$tmp" "$final"
  echo "$new_hash" > "$HASH_FILE"
  log "Sicherung angelegt: $(basename "$final") ($(wc -c < "$final") Bytes)"

  today_file="$DAILY/$PREFIX-$(date '+%Y%m%d').dump"
  if [ ! -f "$today_file" ]; then cp "$final" "$today_file"; fi

  # Retention. `ls -t` sorts newest first; everything past KEEP_RECENT goes.
  ls -1t "$RECENT"/"$PREFIX"-*.dump 2>/dev/null | tail -n +"$((KEEP_RECENT + 1))" | while read -r old; do rm -f "$old"; done
  find "$DAILY" -name "$PREFIX-*.dump" -mtime +"$KEEP_DAILY_DAYS" -exec rm -f {} \; 2>/dev/null
  return 0
}

if [ "${1:-}" = "once" ]; then
  dump_once
  exit $?
fi

log "Backup-Dienst gestartet (Intervall: ${INTERVAL_HOURS}h, behalte ${KEEP_RECENT} aktuelle + ${KEEP_DAILY_DAYS} Tage taeglich)."
# As the container's PID 1, sh ignores SIGTERM unless trapped, and a foreground `sleep` would delay
# even a trapped signal until it finishes - so sleep in the background and `wait` on it, which IS
# interruptible. Without this `docker compose down` stalls for the full 10s kill timeout.
trap 'log "Beende."; exit 0' TERM INT
while true; do
  dump_once || true
  sleep "$((INTERVAL_HOURS * 3600))" &
  wait $!
done
