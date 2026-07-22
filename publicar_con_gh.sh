#!/usr/bin/env bash
set -euo pipefail

REPO_NAME="powertest-luis-pwa"
DESCRIPTION="PWA personal de PowerTest para Luis"

cd "$(dirname "$0")"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh no está instalado. Instálalo con: sudo dnf install gh"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh no está autenticado. Ejecuta primero: gh auth login"
  exit 1
fi

GH_USER="$(gh api user --jq .login)"

if gh repo view "$GH_USER/$REPO_NAME" >/dev/null 2>&1; then
  echo "El repo ya existe: $GH_USER/$REPO_NAME"
  if ! git remote get-url origin >/dev/null 2>&1; then
    git remote add origin "https://github.com/$GH_USER/$REPO_NAME.git"
  fi
  git push -u origin main
else
  gh repo create "$REPO_NAME" --public --description "$DESCRIPTION" --source . --push
fi

# Activar GitHub Pages desde main / root. Si ya existe, no pasa nada.
if gh api --method GET "repos/$GH_USER/$REPO_NAME/pages" >/dev/null 2>&1; then
  echo "GitHub Pages ya estaba activado."
else
  gh api --method POST "repos/$GH_USER/$REPO_NAME/pages" \
    -F "source[branch]=main" \
    -F "source[path]=/" >/dev/null
fi

URL="https://$GH_USER.github.io/$REPO_NAME/"
echo ""
echo "Publicado. URL esperada:"
echo "$URL"
echo ""
echo "Puede tardar 1-3 minutos en aparecer la primera vez."
