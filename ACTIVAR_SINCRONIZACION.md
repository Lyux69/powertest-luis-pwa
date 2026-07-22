# Activar sincronización automática PowerTest

Ya he preparado el sistema para que funcione así:

PowerTest API
→ GitHub Actions cada 15 minutos
→ Supabase
→ PWA pública

## Ya configurado por Igor

En GitHub Secrets ya están puestos:

- POWERTEST_TOKEN
- SUPABASE_URL

## Falta poner en GitHub Secrets

Faltan estos secretos:

- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_USER_ID o SUPABASE_USER_EMAIL

Recomendado:

- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_USER_EMAIL

## Dónde se ponen

GitHub repo:

https://github.com/Lyux69/powertest-luis-pwa/settings/secrets/actions

Pulsa:

New repository secret

Y añade cada uno.

## De dónde sale SUPABASE_SERVICE_ROLE_KEY

Supabase:

Project Settings
→ API
→ Project API keys
→ service_role

Importante:

NO pegar esa clave en WhatsApp.
NO pegarla en README.
NO ponerla en app.js.
Solo guardarla como secreto de GitHub.

## SUPABASE_USER_EMAIL

Es el email con el que entras en la PWA de PowerTest.

Ejemplo de nombre del secreto:

SUPABASE_USER_EMAIL

Valor:

tu email de login de Supabase

## SQL que hay que ejecutar una vez en Supabase

Archivo preparado:

supabase/migrations/001_sync_automation.sql

También está aquí localmente:

/home/luisrivero/Documentos/PowerTest_encontrado/powertest-github-pages/supabase/migrations/001_sync_automation.sql

Ejecutarlo en:

Supabase
→ SQL Editor
→ New query
→ pegar SQL
→ Run

## Después de poner secretos y SQL

Ejecutar manualmente el workflow:

GitHub repo
→ Actions
→ Sincronizar PowerTest con Supabase
→ Run workflow

Si sale verde, ya queda automático cada 15 minutos.
