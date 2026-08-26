-- =========================================================================
--  Complemento a 0001/0002. Al construir el módulo de Reparaciones (quitar
--  fotos existentes desde el modal) se detectó que faltaba la política de
--  DELETE sobre ticket_fotos — sin ella, RLS bloquea el borrado en
--  silencio (0 filas afectadas, sin error). Se permite borrar una foto solo
--  a quien ya puede editar el ticket dueño de esa foto (admin, el técnico
--  asignado, o cualquiera si el ticket aún no tiene técnico).
-- =========================================================================
drop policy if exists ticket_fotos_delete on public.ticket_fotos;
create policy ticket_fotos_delete on public.ticket_fotos for delete
  using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_fotos.ticket_id
        and (public.es_admin() or t.tecnico_id = auth.uid() or t.tecnico_id is null)
    )
  );
