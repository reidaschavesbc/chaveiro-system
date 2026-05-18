#!/bin/bash

APP_DIR="/home/chaveiro/chaveiro-system"
TOKEN=$(cat /home/chaveiro/.backup_token)
REMOTE="https://reidaschavesbc:${TOKEN}@github.com/reidaschavesbc/chaveiro-system.git"
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
