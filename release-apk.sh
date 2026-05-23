#!/bin/bash
# Uso: ./release-apk.sh 1.2.0

VERSION="$1"

if [ -z "$VERSION" ]; then
  echo "Uso: ./release-apk.sh <versao>"
  echo "Exemplo: ./release-apk.sh 1.2.0"
  exit 1
fi

TAG="apk-$VERSION"
TOKEN=$(cat /home/chaveiro/.backup_token)
REMOTE="https://reidaschavesbc:${TOKEN}@github.com/reidaschavesbc/chaveiro-system.git"

echo "Atualizando versão para $VERSION..."

# Atualiza versão no app.json
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" mobile-app/app.json

# Commit da nova versão
git add mobile-app/app.json
git commit -m "chore: bump APK version to $VERSION"
git push "$REMOTE" main

echo "Criando release APK $TAG..."

git tag "$TAG"
git push "$REMOTE" "$TAG"

echo ""
echo "Tag $TAG enviada! Build do APK iniciado no GitHub Actions (~18 min)."
