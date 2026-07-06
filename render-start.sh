#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="/var/data/retrobot"
DB_SRC="database.db"
DB_DST="$DATA_DIR/database.db"
SYSTEM_SRC="src/database/system.json"
SYSTEM_DST="$DATA_DIR/system.json"

mkdir -p "$DATA_DIR"

if [ -f "$DB_SRC" ] && [ ! -f "$DB_DST" ]; then
  cp "$DB_SRC" "$DB_DST"
fi

if [ -f "$SYSTEM_SRC" ] && [ ! -f "$SYSTEM_DST" ]; then
  cp "$SYSTEM_SRC" "$SYSTEM_DST"
fi

if [ -f "$DB_DST" ]; then
  ln -sfn "$DB_DST" "database.db"
fi

mkdir -p "src/database"

if [ -f "$SYSTEM_DST" ]; then
  ln -sfn "$SYSTEM_DST" "src/database/system.json"
fi

exec node src/index.js

