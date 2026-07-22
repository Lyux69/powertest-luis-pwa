# Publicar PowerTest PWA en GitHub Pages

La PWA ya está preparada como repositorio local aquí:

/home/luisrivero/Documentos/PowerTest_encontrado/powertest-github-pages

## Importante

En este PC ahora mismo no hay sesión de GitHub configurada para que Igor pueda empujar el repo automáticamente.

Comprobado:

- `git` sí está instalado.
- `gh` no está instalado.
- no hay `GITHUB_TOKEN` configurado.

Por eso necesitamos iniciar sesión en GitHub o crear un token.

## Opción recomendada para Luis: instalar gh e iniciar sesión

### 1. Instalar GitHub CLI

En Fedora:

```bash
sudo dnf install gh
```

### 2. Iniciar sesión

```bash
gh auth login
```

Elige:

- GitHub.com
- HTTPS
- Login with a web browser

### 3. Cuando esté logueado, Igor puede publicar con:

```bash
cd /home/luisrivero/Documentos/PowerTest_encontrado/powertest-github-pages
gh repo create powertest-luis-pwa --public --source . --push
gh repo edit --enable-pages
```

Si `gh repo edit --enable-pages` no funciona en tu versión, se activa desde la web:

Repositorio → Settings → Pages → Deploy from branch → main → /root → Save

## Opción alternativa sin gh

1. Entra en GitHub.
2. Crea un repo público llamado:

powertest-luis-pwa

3. Luego en terminal:

```bash
cd /home/luisrivero/Documentos/PowerTest_encontrado/powertest-github-pages
git remote add origin https://github.com/TU_USUARIO/powertest-luis-pwa.git
git push -u origin main
```

GitHub pedirá usuario y token, no contraseña normal.

## URL final esperada

Cuando GitHub Pages esté activado, la URL será algo parecido a:

https://TU_USUARIO.github.io/powertest-luis-pwa/

## Seguridad

La clave de Supabase que va dentro de la PWA es la publishable key pública.

NO subir nunca:

- service_role key
- contraseñas
- tokens privados
