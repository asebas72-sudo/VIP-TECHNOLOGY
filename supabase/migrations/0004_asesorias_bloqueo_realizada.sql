-- =========================================================================
--  Replica el bloqueo de updateAsesoriaBackend() en legacy/Code.js:
--  "Esta asesoría ya fue marcada como REALIZADA y no admite más ediciones."
--  Esa regla aplicaba para CUALQUIER usuario (incluido admin) — por eso va
--  como trigger en la base de datos, no como política RLS (que sí distingue
--  por rol/usuario).
-- =========================================================================
create or replace function public.trg_bloquear_asesoria_realizada()
returns trigger language plpgsql as $$
begin
  if old.estado = 'REALIZADA' then
    raise exception 'Esta asesoría ya fue marcada como REALIZADA y no admite más ediciones.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_asesorias_bloqueo_realizada on public.asesorias;
create trigger trg_asesorias_bloqueo_realizada
  before update on public.asesorias
  for each row execute function public.trg_bloquear_asesoria_realizada();
