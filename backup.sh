#!/bin/bash

# Backup do sistema chaveiro
# Uso: ./backup.sh [destino]
# Exemplo: ./backup.sh /mnt/backup  ou  ./backup.sh (usa /root/backups)

DESTINO="${1:-/root/backups}"
DATA=$(date +"%Y-%m-%d_%H-%M-%S")
NOME="chaveiro_backup_$DATA"
PASTA_BACKUP="$DESTINO/$NOME"
APP_DIR="/root/chaveiro-system"

mkdir -p "$PASTA_BACKUP"

echo "=== Backup do Sistema Chaveiro ==="
echo "Data: $DATA"
echo "Destino: $PASTA_BACKUP"
echo ""

# 1. Banco de dados SQLite (força checkpoint do WAL antes de copiar)
echo "[1/4] Copiando banco de dados..."
mkdir -p "$PASTA_BACKUP/database"

# Força o SQLite a consolidar o WAL no arquivo principal
if command -v sqlite3 &>/dev/null; then
    sqlite3 "$APP_DIR/database/chaveiro.db" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null && echo "  WAL checkpoint OK"
fi

cp "$APP_DIR/database/chaveiro.db"     "$PASTA_BACKUP/database/"
cp "$APP_DIR/database/chaveiro.db-wal" "$PASTA_BACKUP/database/" 2>/dev/null || true
cp "$APP_DIR/database/chaveiro.db-shm" "$PASTA_BACKUP/database/" 2>/dev/null || true
echo "  Banco copiado: $(du -sh "$APP_DIR/database/chaveiro.db" | cut -f1)"

# 2. Código da aplicação
echo "[2/4] Copiando código..."
mkdir -p "$PASTA_BACKUP/app"
cp -r "$APP_DIR/routes"     "$PASTA_BACKUP/app/"
cp -r "$APP_DIR/services"   "$PASTA_BACKUP/app/"
cp -r "$APP_DIR/middleware"  "$PASTA_BACKUP/app/"
cp -r "$APP_DIR/public"     "$PASTA_BACKUP/app/"
cp    "$APP_DIR/server.js"  "$PASTA_BACKUP/app/"
cp    "$APP_DIR/package.json" "$PASTA_BACKUP/app/"
echo "  Código copiado"

# 3. Configurações
echo "[3/4] Copiando configurações..."
mkdir -p "$PASTA_BACKUP/config"
cp "$APP_DIR/.env"              "$PASTA_BACKUP/config/" 2>/dev/null || echo "  .env não encontrado"
cp "$APP_DIR/ecosystem.config.js" "$PASTA_BACKUP/config/"
cp "$APP_DIR/Dockerfile"        "$PASTA_BACKUP/config/" 2>/dev/null || true
cp "$APP_DIR/docker-compose.yml" "$PASTA_BACKUP/config/" 2>/dev/null || true
echo "  Configurações copiadas"

# 4. Sessão WhatsApp
echo "[4/4] Copiando sessão WhatsApp..."
if [ -n "$(ls -A "$APP_DIR/whatsapp-session/" 2>/dev/null)" ]; then
    cp -r "$APP_DIR/whatsapp-session" "$PASTA_BACKUP/"
    echo "  Sessão WhatsApp copiada"
else
    echo "  Sessão WhatsApp vazia, pulando"
fi

# Compacta tudo em um único arquivo .tar.gz
echo ""
echo "Compactando backup..."
tar -czf "$DESTINO/$NOME.tar.gz" -C "$DESTINO" "$NOME"
rm -rf "$PASTA_BACKUP"

TAMANHO=$(du -sh "$DESTINO/$NOME.tar.gz" | cut -f1)
echo ""
echo "=== Backup concluído ==="
echo "Arquivo: $DESTINO/$NOME.tar.gz"
echo "Tamanho: $TAMANHO"

# Remove backups com mais de 30 dias
echo ""
echo "Limpando backups antigos (>30 dias)..."
find "$DESTINO" -name "chaveiro_backup_*.tar.gz" -mtime +30 -delete -print
echo "Feito."
