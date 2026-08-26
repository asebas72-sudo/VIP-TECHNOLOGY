# VIP TECHNOLOGY — Sistema de Servicio Técnico

Migración del sistema legacy (Google Apps Script + Google Sheets, ver [`legacy/`](legacy/))
a una arquitectura moderna de bajo costo: **Supabase + GitHub Pages**, sin backend
propio que mantener.

## Arquitectura

```
frontend/  (Vite + Tailwind + JS modular, PWA)  ──▶  Supabase (Postgres + Auth + Storage)
                                                        └─ Edge Functions (envío de correos)
```

- **Base de datos**: PostgreSQL en Supabase — esquema en [`supabase/migrations/0001_init_schema.sql`](supabase/migrations/0001_init_schema.sql).
- **Autenticación**: Supabase Auth (los usuarios legacy migran a un correo sintético `usuario@vip.local`, ver [`scripts/migrate_xlsx_to_supabase.py`](scripts/migrate_xlsx_to_supabase.py)).
- **Autorización**: Row Level Security (un técnico solo ve/edita lo suyo; admin ve todo) — políticas en el mismo archivo de esquema.
- **Storage**: Supabase Storage para fotos de equipos y firmas (reemplaza a Google Drive).
- **Lógica de servidor**: solo lo que *necesita* correr fuera del navegador (enviar correos con plantilla HTML) vive en `supabase/functions/` (Deno). Todo el CRUD (ingresos, reparaciones, asesorías, clientes) lo hace el frontend directo contra la API auto-generada de Supabase (PostgREST), protegido por RLS.
- **Frontend**: Vite + Tailwind CSS + JS modular, configurado como PWA instalable y empaquetable como APK (Capacitor / PWABuilder).
- **Hosting**: GitHub Pages, con deploy automático vía GitHub Actions ([`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)) en cada push a `main`.

Todo el stack corre en tiers gratuitos.

## Puesta en marcha

1. **Crear el proyecto en [supabase.com](https://supabase.com)** (free tier).
2. Pegar y ejecutar [`supabase/migrations/0001_init_schema.sql`](supabase/migrations/0001_init_schema.sql) en el SQL Editor de Supabase.
3. Copiar `frontend/.env.example` → `frontend/.env` y completar con la URL y `anon key` del proyecto (Project Settings → API).
4. `cd frontend && npm install && npm run dev` para desarrollo local.
5. Configurar el secreto `RESEND_API_KEY` en Supabase (`supabase secrets set RESEND_API_KEY=...`) y desplegar las Edge Functions: `supabase functions deploy send-ingreso-email send-asesoria-email`.
6. Crear el repo en GitHub, hacer push, y configurar en Settings → Secrets los valores `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` para que el workflow de Pages pueda compilar.
7. Habilitar GitHub Pages (Settings → Pages → Source: GitHub Actions).
8. Una vez migrados los datos (paso 9), la app queda accesible en `https://<usuario>.github.io/<repo>/`.
9. **Migrar los datos reales** del Excel legacy: `pip install requests openpyxl`, exportar `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, y correr `python scripts/migrate_xlsx_to_supabase.py`.

## Empaquetado como APK (Android)

El mismo `frontend/` es una PWA instalable. Para un `.apk` real:

- **Rápido**: [pwabuilder.com](https://www.pwabuilder.com) → pegar la URL de GitHub Pages → genera un APK/AAB firmado.
- **Con más control** (recomendado, dado el uso de cámara/firma): [Capacitor](https://capacitorjs.com) sobre `frontend/dist`.

No requiere Play Store para uso interno — el `.apk` se instala directo en los celulares de los técnicos.

## Estructura del repositorio

```
├── frontend/            App web (Vite + Tailwind + JS), PWA
│   ├── src/js/pages/    Un módulo por pantalla (menu, ingresos, reparaciones, asesorías)
│   ├── src/js/auth.js   Login/logout contra Supabase Auth
│   └── src/lib/         Cliente de Supabase
├── supabase/
│   ├── migrations/      Esquema SQL versionado
│   └── functions/       Edge Functions (envío de correos)
├── scripts/              Migración única del Excel legacy a Supabase
├── legacy/               Código original de Apps Script (referencia, no se despliega)
└── .github/workflows/    CI/CD a GitHub Pages
```
