# claude-landing-api

Лендинг розыгрыша Claude Pro/Max + Supabase submit. Деплой на Cloudflare Pages.

## Структура
- `index.html` — главная страница (giveaway)
- `privacy.html` — политика конфиденциальности
- `images/` — картинки
- `functions/api/submit.js` — Cloudflare Pages Function (приём заявок)

## Деплой
Платформа: **Cloudflare Pages**. Build command: пусто. Output directory: `/`.

### Переменные среды (Cloudflare Pages → Settings → Environment variables → Production)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TURNSTILE_SECRET`
