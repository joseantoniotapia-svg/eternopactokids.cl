-- =====================================================================
-- Eterno Pacto Kids · Permisos Inicial / Avanzado / Completo y miniaturas
-- Se ejecuta DESPUÉS de plataforma.sql. Se puede ejecutar más de una vez.
-- =====================================================================
update public.planes set nombre = 'Inicial',  descripcion = 'Material abierto para todas las congregaciones' where id = 'gratis'   and nombre = 'Gratis';
update public.planes set nombre = 'Avanzado', descripcion = 'Material del nivel Avanzado'                    where id = 'basico'   and nombre = 'Básico';
update public.planes set descripcion = 'Todo el material de la biblioteca central' where id = 'completo' and descripcion is null;

-- Lo bloqueado se ve con su miniatura, pero sin el archivo
create or replace function public.central_para(p_comunidad uuid, p_col text)
returns table (id text, data jsonb, bloqueado boolean)
language sql stable security definer set search_path = public as $$
  with c as (
    select coalesce((select p.orden from public.comunidades co left join public.planes p on p.id = co.plan_id where co.id = p_comunidad), 0) as orden
  )
  select d.id,
         case when x.lib or public.es_super() then d.data
              else jsonb_strip_nulls(jsonb_build_object('titulo', d.data->'titulo', 'numero', d.data->'numero', 'nombre', d.data->'nombre',
                     'desc', d.data->'desc', 'plan', d.data->'plan', 'fecha', d.data->'fecha', 'tipo', d.data->'tipo', 'orden', d.data->'orden',
                     'thumb', d.data->'thumb')) end,
         not x.lib
  from public.docs d
  cross join c
  left join public.planes pi on pi.id = coalesce(d.data->>'plan', 'gratis')
  left join public.excepciones e on e.comunidad_id = p_comunidad and e.col = d.col and e.doc_id = d.id
  cross join lateral (select coalesce(e.liberado, coalesce(pi.orden, 0) <= c.orden) as lib) x
  where d.comunidad_id = public.central_id() and d.col = p_col
    and public.mi_rol(p_comunidad) is not null
    and (p_col <> 'matprofes' or public.es_equipo(p_comunidad))
$$;
revoke all on function public.central_para(uuid, text) from public, anon;
grant execute on function public.central_para(uuid, text) to authenticated;

select 'Listo: permisos Inicial, Avanzado y Completo' as resultado;
