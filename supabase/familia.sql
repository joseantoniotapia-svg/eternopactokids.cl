-- =====================================================================
-- Eterno Pacto Kids · Niños vinculados a su familia y observaciones visibles para ella
-- Se ejecuta DESPUÉS de clases.sql. Se puede ejecutar más de una vez.
-- =====================================================================
-- La familia vincula a su hijo con el código que le da el maestro
create or replace function public.vincular_nino(p_comunidad uuid, p_codigo text)
returns text language plpgsql security definer set search_path = public as $$
declare d record;
begin
  if public.mi_rol(p_comunidad) is null then raise exception 'No perteneces a esta congregación'; end if;
  select id, data into d from public.docs
   where comunidad_id = p_comunidad and col = 'ninos' and upper(coalesce(data->>'codigo', '')) = upper(trim(p_codigo)) limit 1;
  if d.id is null then raise exception 'No encontramos ese código. Revísalo con el maestro.'; end if;
  if coalesce(d.data->>'familia_uid', '') not in ('', auth.uid()::text) then raise exception 'Este código ya está vinculado a otra familia. Habla con el maestro.'; end if;
  update public.docs set data = jsonb_set(data, '{familia_uid}', to_jsonb(auth.uid()::text)), actualizado = now()
   where comunidad_id = p_comunidad and col = 'ninos' and id = d.id;
  return d.data->>'nombre';
end $$;
revoke all on function public.vincular_nino(uuid, text) from public, anon;
grant execute on function public.vincular_nino(uuid, text) to authenticated;

-- Observaciones del libro de clases que el maestro marcó como visibles para la familia (solo de sus hijos)
create or replace function public.mis_observaciones(p_comunidad uuid)
returns table (nino_id text, clase_id text, fecha text, texto text)
language sql stable security definer set search_path = public as $$
  select n.id, l.id, c.data->>'fecha', l.data->'obs'->>n.id
  from public.docs n
  join public.docs l on l.comunidad_id = n.comunidad_id and l.col = 'libro'
  left join public.docs c on c.comunidad_id = n.comunidad_id and c.col = 'clases' and c.id = l.id
  where n.comunidad_id = p_comunidad and n.col = 'ninos' and n.data->>'familia_uid' = auth.uid()::text
    and public.mi_rol(p_comunidad) is not null
    and coalesce((l.data->'obsFam'->>n.id)::boolean, false)
    and coalesce(l.data->'obs'->>n.id, '') <> ''
  order by c.data->>'fecha' desc nulls last
  limit 100
$$;
revoke all on function public.mis_observaciones(uuid) from public, anon;
grant execute on function public.mis_observaciones(uuid) to authenticated;

select 'Listo: familias vinculadas' as resultado;
