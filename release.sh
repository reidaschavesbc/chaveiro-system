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
TOKEN="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"
REMOTE="https://tvsxgames:${TOKEN}@github.com/tvsxgames/chaveiro-system.git"

git push "$REMOTE" main
git push "$REMOTE" "v$VERSION"

echo ""
echo "Release v$VERSION enviado!"
echo "O GitHub Actions vai buildar e publicar o instalador automaticamente."
echo "O app Electron vai se atualizar sozinho nos clientes."
