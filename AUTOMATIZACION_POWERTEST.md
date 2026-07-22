# Automatización PowerTest → Supabase → PWA

Objetivo: que la PWA haga lo mismo que el Google Sheets actual, pero sin depender del PC principal.

Fecha: 22 de julio de 2026

## Decisión técnica

Usaremos GitHub Actions como “motor automático”.

Así queda:

PowerTest API
→ GitHub Actions cada 5 minutos
→ Supabase
→ PWA publicada en GitHub Pages

Google Sheets actual se queda intacto.

## Qué vamos a replicar del Google Sheets

Del sistema v2.6 actual vamos a replicar:

1. Actualización automática cada 5 minutos.
2. Lectura de `/users/me` para obtener el userId.
3. Lectura de `/test-responses/passed` con paginación.
4. Guardado de tests.
5. Resumen de métricas.
6. Fallos y no respondidas.
7. Temas débiles.
8. Estado de sincronización.
9. Diagnóstico básico de errores.

## Qué NO vamos a replicar igual

Google Docs no se replica como documento de Google.

En la PWA lo mejor es mostrar los fallos dentro de la propia app:

- Fallos
- No respondidas
- Tema
- Tu respuesta
- Respuesta correcta

Más adelante se puede añadir exportar a PDF o copiar informe.

## Secretos necesarios

Para que GitHub Actions pueda trabajar sin tu PC, necesita secretos guardados en GitHub.

No van dentro del código.

Necesarios:

- POWERTEST_TOKEN
- SUPABASE_SERVICE_ROLE_KEY

Ya tenemos en código público:

- SUPABASE_URL
- SUPABASE_PUBLISHABLE_KEY

Pero para escribir desde GitHub Actions con seguridad hace falta la service_role key como secreto de GitHub.

## Seguridad

Nunca poner estos secretos en:

- app.js
- README
- WhatsApp
- código público

Solo en:

GitHub repo → Settings → Secrets and variables → Actions → New repository secret

## Archivos que vamos a crear

En el repo GitHub Pages:

```text
scripts/sync-powertest.mjs
.github/workflows/sync-powertest.yml
supabase/migrations/001_sync_automation.sql
```

## Antes de activar

Primero se crea todo.
Después tú pones los secretos.
Después ejecutamos manualmente el workflow.
Cuando funcione, dejamos el horario automático.

## Resultado esperado

Tú haces un test en PowerTest.
A los pocos minutos GitHub Actions lo trae.
Se guarda en Supabase.
La PWA lo muestra sin tener tu PC encendido.
