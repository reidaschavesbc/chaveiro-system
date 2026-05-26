#!/bin/bash
# Script para criar uma nova release com auto-update
# Uso: ./release.sh 1.2.0

VERSION="$1"

if [ -z "$VERSION" ]; then
  echo "Uso: ./release.sh <versao>"
  echo "Exemplo: ./release.sh 1.2.0"
  exit 1
fi

echo "Preparando release v$VERSION..."

# Atualiza a versão no package.json
npm version "$VERSION" --no-git-tag-version

# Faz commit da nova versão
git add package.json package-lock.json
git commit -m "release v$VERSION"

# Cria a tag
git tag "v$VERSION"

# Push com a tag (o CI/GitHub Actions vai buildar e publicar o release)
TOKEN=$(cat /home/chaveiro/.backup_token)
REMOTE="https://reidaschavesbc:${TOKEN}@github.com/reidaschavesbc/chaveiro-system.git"

git push "$REMOTE" main
git push "$REMOTE" "v$VERSION"

# Reinicia o PM2 para aplicar as mudanças
pm2 restart chaveiro-system

echo ""
echo "Release v$VERSION enviado! Aguardando build do GitHub Actions (~15 min)..."

# Aguarda o build terminar e baixa automaticamente
REPO="reidaschavesbc/chaveiro-system"
DOWNLOADS="/home/chaveiro/chaveiro-system/public/downloads"

echo "Verificando build a cada 30 segundos..."
for i in $(seq 1 40); do
  sleep 30
  STATUS=$(GH_TOKEN="$TOKEN" gh release view "v$VERSION" --repo "$REPO" --json assets --jq '.assets | length' 2>/dev/null)
  if [ "$STATUS" -ge 3 ] 2>/dev/null; then
    echo "Build concluído! Baixando arquivos..."
    GH_TOKEN="$TOKEN" gh release download "v$VERSION" --repo "$REPO" \
      --pattern "SistemaChaveiro-Setup.exe" \
      --pattern "latest.yml" \
      --pattern "SistemaChaveiro-Setup.exe.blockmap" \
      --dir "$DOWNLOADS" --clobber
    echo "Pronto! Auto-update ativo para v$VERSION."
    exit 0
  fi
  echo "  Aguardando... (${i}/40)"
done

echo "Timeout — baixe manualmente:"
echo "  GH_TOKEN=\"$TOKEN\" gh release download v$VERSION --repo $REPO --pattern \"SistemaChaveiro-Setup.exe\" --pattern \"latest.yml\" --pattern \"SistemaChaveiro-Setup.exe.blockmap\" --dir $DOWNLOADS --clobber"
