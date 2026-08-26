-- =========================================================================
--  Complemento a 0001_init_schema.sql
--  Al implementar el módulo de Ingresos se detectó que faltaban políticas
--  de INSERT (0001 solo cubría SELECT/UPDATE) y el bucket de Storage para
--  fotos/firmas. Es aditivo y seguro de correr sobre una base ya migrada.
-- =========================================================================

-- Cualquier usuario autenticado (admin o técnico) puede crear un ticket,
-- una foto de ticket o una asesoría nueva. Las reglas de "quién puede
-- EDITAR qué" ya las cubren las políticas de UPDATE de 0001.
drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets for insert
  with check (auth.role() = 'authenticated');

drop policy if exists ticket_fotos_insert on public.ticket_fotos;
create policy ticket_fotos_insert on public.ticket_fotos for insert
  with check (auth.role() = 'authenticated');

drop policy if exists asesorias_insert on public.asesorias;
create policy asesorias_insert on public.asesorias for insert
  with check (auth.role() = 'authenticated');

-- -------------------------------------------------------------------------
-- STORAGE: bucket "evidencias" — fotos de equipos + firmas del cliente.
-- Público de lectura (las URLs se usan directo en <img> y en los correos),
-- escritura solo para usuarios autenticados.
-- -------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('evidencias', 'evidencias', true)
  on conflict (id) do nothing;

drop policy if exists evidencias_lectura_publica on storage.objects;
create policy evidencias_lectura_publica on storage.objects for select
  using (bucket_id = 'evidencias');

drop policy if exists evidencias_escritura_autenticados on storage.objects;
create policy evidencias_escritura_autenticados on storage.objects for insert
  with check (bucket_id = 'evidencias' and auth.role() = 'authenticated');

drop policy if exists evidencias_actualizacion_autenticados on storage.objects;
create policy evidencias_actualizacion_autenticados on storage.objects for update
  using (bucket_id = 'evidencias' and auth.role() = 'authenticated');
