# PowerTest PWA — primera versión local

Esta carpeta contiene la primera PWA de PowerTest para Luis.

## Qué hace ahora

- Muestra una pantalla inicial bonita y móvil.
- Se conecta a Supabase con la URL pública y la publishable key.
- Permite login por email/enlace mágico.
- Lee estas tablas:
  - tests
  - fallos
  - temas_progreso
- No toca Google Sheets.

## Archivos

- index.html: pantalla principal.
- app.js: conexión con Supabase y lógica.
- styles.css: diseño móvil/iPad/PC.
- manifest.webmanifest: configuración para instalar como PWA.
- sw.js: service worker básico.
- icon.svg: icono temporal.

## Cómo probar en el PC

Desde terminal:

```bash
cd /home/luisrivero/Documentos/PowerTest_encontrado/pwa
python3 -m http.server 4173
```

Luego abrir:

http://localhost:4173

## Siguiente paso

1. Activar login por email en Supabase si falta.
2. Crear/invitar el usuario de Luis en Authentication → Users.
3. Probar entrada con email.
4. Meter datos de prueba en Supabase.
5. Cuando funcione, publicar en GitHub Pages.
