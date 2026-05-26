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
echo "Tag $TAG enviada! Aguardando build do GitHub Actions (~18 min)..."

REPO="reidaschavesbc/chaveiro-system"
DOWNLOADS="/home/chaveiro/chaveiro-system/public/downloads"

echo "Verificando build a cada 30 segundos..."
for i in $(seq 1 50); do
  sleep 30
  STATUS=$(GH_TOKEN="$TOKEN" gh release view "$TAG" --repo "$REPO" --json assets --jq '.assets | length' 2>/dev/null)
  if [ "$STATUS" -ge 1 ] 2>/dev/null; then
    echo "Build concluído! Baixando APK..."
    GH_TOKEN="$TOKEN" gh release download "$TAG" --repo "$REPO" \
      --pattern "*.apk" \
      --dir "$DOWNLOADS" --clobber
    # Renomeia para o nome padrão
    # Backup do APK anterior antes de sobrescrever
    if [ -f "$DOWNLOADS/ChaveiroOS.apk" ]; then
      cp "$DOWNLOADS/ChaveiroOS.apk" "$DOWNLOADS/ChaveiroOS.apk.bak"
      cp "$DOWNLOADS/version-apk.json" "$DOWNLOADS/version-apk.previous.json" 2>/dev/null || true
    fi
    find "$DOWNLOADS" -name "*.apk" ! -name "ChaveiroOS.apk" ! -name "ChaveiroOS.apk.bak" -exec mv {} "$DOWNLOADS/ChaveiroOS.apk" \;
    echo "{\"version\":\"$VERSION\"}" > "$DOWNLOADS/version-apk.json"
    echo "Pronto! APK $VERSION disponível para download."
    exit 0
  fi
  echo "  Aguardando... (${i}/50)"
done

echo "Timeout — baixe manualmente com:"
echo "  GH_TOKEN=\"$TOKEN\" gh release download $TAG --repo $REPO --pattern \"*.apk\" --dir $DOWNLOADS --clobber"
