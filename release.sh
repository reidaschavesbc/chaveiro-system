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

# Reconstrói a imagem e recria o container (garante que html/css/js atualizem)
docker compose up -d --build

echo ""
echo "Release v$VERSION enviado! Aguardando build do GitHub Actions (~5 min)..."
echo "Quando terminar, execute para publicar e copiar os arquivos:"
echo ""
echo "  GH_TOKEN=\"$TOKEN\" gh release edit v$VERSION --repo tvsxgames/chaveiro-system --draft=false"
echo "  GH_TOKEN=\"$TOKEN\" gh release download v$VERSION --repo tvsxgames/chaveiro-system --pattern \"SistemaChaveiro-Setup.exe\" --pattern \"latest.yml\" --pattern \"SistemaChaveiro-Setup.exe.blockmap\" --dir /root/chaveiro-system/public/downloads/ --clobber"
echo ""
echo "Após isso o auto-update nos clientes funcionará automaticamente."
