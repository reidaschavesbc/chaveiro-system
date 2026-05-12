#!/bin/bash
# Uso: ./release-apk.sh 1.2.0

VERSION="$1"

if [ -z "$VERSION" ]; then
  echo "Uso: ./release-apk.sh <versao>"
  echo "Exemplo: ./release-apk.sh 1.2.0"
  exit 1
fi

TAG="apk-$VERSION"
TOKEN="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"
REMOTE="https://tvsxgames:${TOKEN}@github.com/tvsxgames/chaveiro-system.git"

echo "Criando release APK $TAG..."

git tag "$TAG"
git push "$REMOTE" "$TAG"

echo ""
echo "Tag $TAG enviada! Build do APK iniciado no GitHub Actions (~18 min)."
