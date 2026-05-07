#!/bin/bash

APP_DIR="/root/chaveiro-system"
TOKEN="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"
REMOTE="https://tvsxgames:${TOKEN}@github.com/tvsxgames/chaveiro-system.git"
DATA=$(date +"%Y-%m-%d %H:%M")

cd "$APP_DIR"

# Força consolidação do WAL no banco principal
sqlite3 "$APP_DIR/database/chaveiro.db" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null

# Commit e push
git add .
git commit -m "backup automatico $DATA" 2>&1

if git push "$REMOTE" main 2>&1; then
    echo "[$DATA] Backup enviado ao GitHub com sucesso"
else
    echo "[$DATA] ERRO ao enviar backup ao GitHub"
fi
