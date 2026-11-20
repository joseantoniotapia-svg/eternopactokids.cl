-- ============================================================
-- Desafíos diarios (lunes a sábado después de cada clase)
-- Ejecutar una vez en Supabase → SQL Editor.
-- Guarda en docs col 'desafios' un doc por clase:
--   { "<ninoId>": { "1": {"pts":9,"t":"2026-11-23T..."}, ... } }
-- Las familias solo escriben vía registrar_desafio (security definer)
-- y solo leen lo de sus hijos vía mis_desafios.
-- ============================================================

-- Solo el equipo lee la colección completa (política restrictiva: se suma a "leer contenido")
drop policy if exists "desafios solo equipo" on public.docs;
create policy "desafios solo equipo" on public.docs as restrictive for select using (
  col <> 'desafios' or public.es_equipo(comunidad_id)
);

create or replace function public.registrar_desafio(
  p_comunidad uuid, p_clase text, p_nino text, p_dia int, p_puntos int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if p_dia is null or p_dia < 1 or p_dia > 6 then raise exception 'Día inválido'; end if;
  if not exists (select 1 from public.docs c where c.comunidad_id = p_comunidad and c.col = 'clases' and c.id = p_clase) then
    raise exception 'Clase no encontrada';
  end if;
  if not (public.es_equipo(p_comunidad) or exists (
      select 1 from public.docs n
      where n.comunidad_id = p_comunidad and n.col = 'ninos' and n.id = p_nino
        and n.data->>'familia_uid' = auth.uid()::text)) then
    raise exception 'Este niño no está vinculado a tu familia';
  end if;

  insert into public.docs (comunidad_id, col, id, data, actualizado, actualizado_por)
  values (p_comunidad, 'desafios', p_clase,
          jsonb_build_object(p_nino, jsonb_build_object(p_dia::text,
            jsonb_build_object('pts', greatest(0, least(coalesce(p_puntos,0), 10)), 't', now()))),
          now(), auth.uid())
  on conflict (comunidad_id, col, id) do update
    set data = public.docs.data || jsonb_build_object(p_nino,
          coalesce(public.docs.data->p_nino, '{}'::jsonb) || jsonb_build_object(p_dia::text,
            jsonb_build_object('pts', greatest(0, least(coalesce(p_puntos,0), 10)), 't', now()))),
        actualizado = now(), actualizado_por = auth.uid();
end $$;
revoke all on function public.registrar_desafio(uuid, text, text, int, int) from public, anon;
grant execute on function public.registrar_desafio(uuid, text, text, int, int) to authenticated;

create or replace function public.mis_desafios(p_comunidad uuid)
returns table (clase_id text, nino_id text, dias jsonb)
language sql stable security definer set search_path = public as $$
  select d.id, n.id, d.data->n.id
  from public.docs n
  join public.docs d on d.comunidad_id = n.comunidad_id and d.col = 'desafios' and d.data ? n.id
  where n.comunidad_id = p_comunidad and n.col = 'ninos' and n.data->>'familia_uid' = auth.uid()::text
    and public.mi_rol(p_comunidad) is not null
  limit 500
$$;
revoke all on function public.mis_desafios(uuid) from public, anon;
grant execute on function public.mis_desafios(uuid) to authenticated;

select 'Listo: desafíos diarios instalados' as resultado;
