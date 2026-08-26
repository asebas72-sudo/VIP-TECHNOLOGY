-- =========================================================================
--  VIP TECHNOLOGY — Esquema relacional para Supabase (PostgreSQL)
--  Migrado desde: Google Sheets "VIP.xlsx" + lógica de Code.js (Apps Script)
--
--  Cómo ejecutar:
--    Supabase Dashboard → SQL Editor → pegar este archivo completo → Run.
--    Es idempotente (usa IF NOT EXISTS / DROP ... IF EXISTS) para poder
--    re-ejecutarlo en un proyecto limpio sin errores.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 0. EXTENSIONES
-- -------------------------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- comparaciones sin distinguir mayúsculas (usuario, correo)

-- -------------------------------------------------------------------------
-- 1. TIPOS ENUMERADOS
--    Se preservan literalmente los valores de texto que ya usa el frontend
--    (JavaScript.html hace .toUpperCase().trim() y compara contra estos
--    mismos strings), para minimizar la reescritura del cliente.
-- -------------------------------------------------------------------------
do $$ begin
  create type rol_usuario as enum ('admin', 'tecnico');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_ticket as enum (
    'INGRESADO', 'EN PROCESO', 'ESPERA REPUESTOS', 'REVISADO', 'LISTO', 'ENTREGADO'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_asesoria as enum ('PENDIENTE', 'CONFIRMADA', 'REALIZADA', 'CANCELADA');
exception when duplicate_object then null; end $$;

-- -------------------------------------------------------------------------
-- 2. FUNCIÓN AUXILIAR: updated_at automático
-- -------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================================
-- 3. PERFILES  (equivalente a la hoja "Usuarios")
--    Se apoya en Supabase Auth (auth.users) en vez de guardar contraseñas
--    en texto plano como en la hoja original. Como los usuarios legacy
--    ingresan con un "Usuario" simple (no un correo), el backend FastAPI
--    creará cada cuenta en Supabase Auth con un correo sintético
--    "<usuario>@vip.local" y esta tabla solo guarda el perfil/rol.
-- =========================================================================
create table if not exists public.perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  usuario     citext unique not null,          -- login corto, ej: "Sebastian"
  nombre      text not null,                   -- nombre para mostrar / para matchear TecnicoAsignado
  rol         rol_usuario not null default 'tecnico',
  celular     text,                            -- para notificar por WhatsApp
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_perfiles_rol on public.perfiles(rol);

drop trigger if exists trg_perfiles_updated_at on public.perfiles;
create trigger trg_perfiles_updated_at
  before update on public.perfiles
  for each row execute function set_updated_at();

-- =========================================================================
-- 4. MARCAS  (hoja "Marca")
-- =========================================================================
create table if not exists public.marcas (
  id          bigint generated always as identity primary key,
  nombre      citext unique not null,
  logo_url    text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- =========================================================================
-- 5. TIPOS DE EQUIPO (catálogo)
--    En el formulario legacy (IngresosForm.html) el <select> tenía un bug:
--    la opción "Impresora" llevaba value="Todo en uno" (valor duplicado).
--    Se normaliza aquí como catálogo editable en vez de un enum fijo,
--    y se corrige el valor real de "Impresora".
-- =========================================================================
create table if not exists public.tipos_equipo (
  id          bigint generated always as identity primary key,
  nombre      citext unique not null,
  activo      boolean not null default true
);
insert into public.tipos_equipo (nombre)
  values ('Escritorio'), ('Portátil'), ('Todo en uno'), ('Impresora')
  on conflict (nombre) do nothing;

-- =========================================================================
-- 6. CLIENTES  (hoja "Clientes")
--    Cedula como PK natural: el sistema original hace upsert por cédula.
-- =========================================================================
create table if not exists public.clientes (
  cedula          text primary key,               -- se guarda como texto (puede llevar ceros a la izq. / prefijos)
  nombre          text not null,
  correo          citext,
  celular         text,
  ultima_visita   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_clientes_celular on public.clientes(celular);

drop trigger if exists trg_clientes_updated_at on public.clientes;
create trigger trg_clientes_updated_at
  before update on public.clientes
  for each row execute function set_updated_at();

-- =========================================================================
-- 7. TICKETS  (fusiona "Ingresos" + "Reparaciones")
--    En el Sheet original cada ingreso se duplicaba en dos hojas
--    ("Ingresos" y "Reparaciones") que se mantenían sincronizadas a mano
--    vía actualizarFilaPorCodigo_(). Es el mismo objeto de negocio (un
--    ticket de servicio técnico) visto en dos pantallas distintas, así
--    que se modela como UNA sola tabla — elimina la duplicación y la
--    posibilidad de que ambas copias queden desincronizadas.
-- =========================================================================
create table if not exists public.tickets (
  id                  bigint generated always as identity primary key,
  codigo              text unique not null,   -- código único legacy: ddNNccNNccMHHmmss (ver build_codigo())

  cliente_cedula      text not null references public.clientes(cedula),
  celular             text not null,
  correo_cliente      citext,                 -- antes "EmailUser"

  equipo              text not null,
  tipo_equipo_id      bigint references public.tipos_equipo(id),
  marca_id            bigint references public.marcas(id),
  accesorios          text[] not null default '{}',

  fallas              text,
  observaciones       text,

  firma_url           text,                   -- firma del cliente (PNG en Supabase Storage)
  imagen_recepcion_url text,                  -- foto del equipo al ingresar (legacy: "Imagen")

  estado              estado_ticket not null default 'INGRESADO',
  tecnico_id          uuid references public.perfiles(id),

  costo               numeric(12,2),
  observacion_final   text,
  comentario_1        text,
  comentario_2        text,

  fecha_ingreso       timestamptz not null default now(),
  fecha_entrega_estimada timestamptz,
  fecha_reparacion    timestamptz,            -- fecha en que el técnico realizó el trabajo

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_tickets_estado          on public.tickets(estado);
create index if not exists idx_tickets_tecnico          on public.tickets(tecnico_id);
create index if not exists idx_tickets_cliente          on public.tickets(cliente_cedula);
create index if not exists idx_tickets_fecha_ingreso    on public.tickets(fecha_ingreso desc);

drop trigger if exists trg_tickets_updated_at on public.tickets;
create trigger trg_tickets_updated_at
  before update on public.tickets
  for each row execute function set_updated_at();

-- -------------------------------------------------------------------------
-- 7.1 FOTOS DEL TICKET
--    Reemplaza las columnas rígidas Foto1..Foto5 (CONFIG.MAX_FOTOS = 5)
--    por una tabla 1-a-N sin límite fijo, ordenable.
-- -------------------------------------------------------------------------
create table if not exists public.ticket_fotos (
  id          bigint generated always as identity primary key,
  ticket_id   bigint not null references public.tickets(id) on delete cascade,
  url         text not null,
  orden       smallint not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_ticket_fotos_ticket on public.ticket_fotos(ticket_id, orden);

-- -------------------------------------------------------------------------
-- 7.2 CÓDIGO ÚNICO DEL TICKET
--    Reimplementación en PL/pgSQL de buildCodigo_() en Code.js:
--    [DD] + 2 letras nombre + 2 díg. cédula + 2 letras nombre + 2 díg. cédula
--    + 1 letra marca + [HHmmss]
-- -------------------------------------------------------------------------
create or replace function public.build_codigo(
  p_cedula text, p_nombre text, p_marca text, p_fecha timestamptz default now()
) returns text language plpgsql as $$
declare
  v_ced   text := regexp_replace(coalesce(p_cedula, ''), '\D', '', 'g');
  v_nom   text := upper(left(split_part(trim(coalesce(p_nombre, '')), ' ', 1), 4));
  v_mar   text := upper(regexp_replace(coalesce(p_marca, ''), '\s+', '', 'g'));
begin
  return
    to_char(p_fecha, 'DD') ||
    left(v_nom, 2) || left(v_ced, 2) ||
    substr(v_nom, 3, 2) || right(v_ced, 2) ||
    left(v_mar, 1) ||
    to_char(p_fecha, 'HH24MISS');
end;
$$;

create or replace function public.trg_set_codigo() returns trigger language plpgsql as $$
declare
  v_nombre text;
begin
  if new.codigo is null or new.codigo = '' then
    select nombre into v_nombre from public.clientes where cedula = new.cliente_cedula;
    new.codigo := public.build_codigo(
      new.cliente_cedula, v_nombre,
      (select nombre from public.marcas where id = new.marca_id),
      coalesce(new.fecha_ingreso, now())
    );
  end if;
  if new.fecha_entrega_estimada is null then
    new.fecha_entrega_estimada := coalesce(new.fecha_ingreso, now()) + interval '8 days'; -- CONFIG.DIAS_ENTREGA
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tickets_set_codigo on public.tickets;
create trigger trg_tickets_set_codigo
  before insert on public.tickets
  for each row execute function public.trg_set_codigo();

-- =========================================================================
-- 8. ASESORÍAS  (hoja "Asesoria")
-- =========================================================================
create table if not exists public.asesorias (
  id                  bigint generated always as identity primary key,
  cliente_cedula      text not null references public.clientes(cedula),
  celular             text not null,
  correo_cliente      citext,

  solicitud           text not null,          -- tipo de asesoría (catálogo simple, ver nota abajo)
  fallas              text,
  observaciones       text,
  imagen_url          text,

  estado              estado_asesoria not null default 'PENDIENTE',
  tecnico_id          uuid references public.perfiles(id),

  costo               numeric(12,2),
  observacion_final   text,

  fecha_ingreso       timestamptz not null default now(),
  fecha_visita        timestamptz,            -- se agenda después, desde el dashboard

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_asesorias_estado   on public.asesorias(estado);
create index if not exists idx_asesorias_tecnico  on public.asesorias(tecnico_id);
create index if not exists idx_asesorias_cliente  on public.asesorias(cliente_cedula);

drop trigger if exists trg_asesorias_updated_at on public.asesorias;
create trigger trg_asesorias_updated_at
  before update on public.asesorias
  for each row execute function set_updated_at();

-- Nota: "Solicitud" en el formulario legacy es un <select> de texto libre
-- (Instalación de software, Configuración de red, Mantenimiento CCTV, ...).
-- Se deja como texto en vez de catálogo aparte porque no tiene atributos
-- propios (logo, estado, etc.) — a diferencia de Marca — así que un enum
-- o catálogo aparte añadiría complejidad sin beneficio real todavía.

-- =========================================================================
-- 9. SEGURIDAD A NIVEL DE FILA (RLS)
--    FastAPI usará la Service Role Key (bypassa RLS) y replicará en la API
--    las mismas reglas de autorización que hoy viven en Code.js
--    (esAdmin_ / requerirSesion_: un técnico solo ve/edita lo suyo).
--    Aun así se habilita RLS y se agregan políticas equivalentes como capa
--    de defensa adicional, por si en el futuro el frontend consulta
--    Supabase directamente con la anon key + JWT de Supabase Auth.
-- =========================================================================
alter table public.perfiles  enable row level security;
alter table public.clientes  enable row level security;
alter table public.marcas    enable row level security;
alter table public.tipos_equipo enable row level security;
alter table public.tickets   enable row level security;
alter table public.ticket_fotos enable row level security;
alter table public.asesorias enable row level security;

create or replace function public.es_admin() returns boolean language sql stable as $$
  select exists (
    select 1 from public.perfiles p where p.id = auth.uid() and p.rol = 'admin'
  );
$$;

drop policy if exists perfiles_select on public.perfiles;
create policy perfiles_select on public.perfiles for select
  using (auth.uid() = id or public.es_admin());

drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets for select
  using (public.es_admin() or tecnico_id = auth.uid() or tecnico_id is null);

drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets for update
  using (public.es_admin() or tecnico_id = auth.uid() or tecnico_id is null);

drop policy if exists asesorias_select on public.asesorias;
create policy asesorias_select on public.asesorias for select
  using (public.es_admin() or tecnico_id = auth.uid() or tecnico_id is null);

drop policy if exists asesorias_update on public.asesorias;
create policy asesorias_update on public.asesorias for update
  using (public.es_admin() or tecnico_id = auth.uid() or tecnico_id is null);

-- Catálogos: lectura pública (autenticada), escritura solo admin.
drop policy if exists marcas_select on public.marcas;
create policy marcas_select on public.marcas for select using (true);
drop policy if exists marcas_write on public.marcas;
create policy marcas_write on public.marcas for all using (public.es_admin());

drop policy if exists tipos_equipo_select on public.tipos_equipo;
create policy tipos_equipo_select on public.tipos_equipo for select using (true);

drop policy if exists clientes_all on public.clientes;
create policy clientes_all on public.clientes for all using (auth.role() = 'authenticated');

drop policy if exists ticket_fotos_select on public.ticket_fotos;
create policy ticket_fotos_select on public.ticket_fotos for select using (true);

-- =========================================================================
-- 10. DATOS SEMILLA (marcas detectadas en la hoja original)
-- =========================================================================
insert into public.marcas (nombre) values
  ('ACER'), ('HP'), ('DELL'), ('LENOVO'), ('ASUS'), ('EPSON')
  on conflict (nombre) do nothing;

-- Fin del script.
