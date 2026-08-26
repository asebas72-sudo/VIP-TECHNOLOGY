-- =========================================================================
--  Corrige "stack depth limit exceeded" al consultar tickets/asesorías
--  como técnico (no-admin).
--
--  Causa: public.es_admin() hace `select ... from public.perfiles`, y esa
--  misma tabla `perfiles` tiene una política RLS (perfiles_select) que a su
--  vez llama a public.es_admin() — ciclo infinito. Para el propio admin no
--  se notaba porque `auth.uid() = id` es verdadero en su propia fila y
--  Postgres corta ahí sin necesitar evaluar es_admin(); para cualquier otra
--  fila (ej. mirar el perfil de OTRO técnico al hacer el join en Ingresos/
--  Reparaciones/Asesorías) sí dispara el ciclo.
--
--  Solución estándar de Supabase: marcar la función como SECURITY DEFINER,
--  para que su consulta interna corra con los privilegios del dueño de la
--  función (postgres) y no quede sujeta a RLS — rompe el ciclo.
-- =========================================================================
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles p where p.id = auth.uid() and p.rol = 'admin'
  );
$$;
