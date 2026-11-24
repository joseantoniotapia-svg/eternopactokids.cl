-- ============================================================
-- Biblioteca pública (eternopactokids.cl/biblioteca)
-- Muestra el catálogo de la biblioteca central SIN iniciar sesión:
-- solo títulos, portadas y nivel (Avanzado / Premium).
-- Nunca entrega los archivos: para descargar hay que entrar con la cuenta.
-- Solo lectura. Se puede ejecutar más de una vez.
-- ============================================================
create or replace function public.biblioteca_publica()
returns table (col text, id text, data jsonb)
language sql stable security definer set search_path = public as $$
  select d.col, d.id,
         jsonb_strip_nulls(jsonb_build_object(
           'titulo', d.data->'titulo', 'nombre', d.data->'nombre', 'numero', d.data->'numero',
           'desc', d.data->'desc', 'cita', d.data->'cita', 'clase', d.data->'clase', 'parte', d.data->'parte',
           'thumb', d.data->'thumb', 'portadaMini', d.data->'portadaMini',
           'plan', coalesce(d.data->'plan', '"gratis"'::jsonb), 'catPremium', d.data->'catPremium',
           'archivo', d.data->'archivo', 'tamano', d.data->'tamano',
           'narchivos', case when jsonb_typeof(d.data->'archivos') = 'array' then to_jsonb(jsonb_array_length(d.data->'archivos')) end))
  from public.docs d
  where d.comunidad_id = public.central_id()
    and d.col in ('cuentos', 'materiales', 'matprofes', 'maestras')
    and coalesce(public.fecha_ok(d.data->>'libera_desde'), public.hoy_cl()) <= public.hoy_cl()
$$;

revoke all on function public.biblioteca_publica() from public;
grant execute on function public.biblioteca_publica() to anon, authenticated;

select 'Listo: biblioteca pública instalada' as resultado, count(*) as materiales from public.biblioteca_publica();
