-- =====================================================================
-- Eterno Pacto Kids · Fotos de la semana (espacio PRIVADO)
-- Las fotos de los niños no van en "archivos" (que es público): van en "fotos",
-- que solo pueden ver los miembros de la congregación con enlaces que caducan.
-- Se ejecuta DESPUÉS de mejoras.sql.
-- =====================================================================

-- Carpeta privada: solo JPG/WEBP de hasta 5 MB (la app las achica a ~200 KB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 5242880, array['image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- La primera carpeta de cada foto es el id de la congregación
drop policy if exists "fotos: miembros ven" on storage.objects;
create policy "fotos: miembros ven" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and public.mi_rol(((storage.foldername(name))[1])::uuid) is not null);
drop policy if exists "fotos: equipo sube" on storage.objects;
create policy "fotos: equipo sube" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.es_equipo(((storage.foldername(name))[1])::uuid));
drop policy if exists "fotos: equipo borra" on storage.objects;
create policy "fotos: equipo borra" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and public.es_equipo(((storage.foldername(name))[1])::uuid));

-- La familia autoriza (o no) las fotos de su propio hijo
create or replace function public.autorizar_fotos(p_comunidad uuid, p_nino text, p_si boolean)
returns text language plpgsql security definer set search_path = public as $$
begin
  update public.docs
     set data = jsonb_set(jsonb_set(data, '{fotos}', to_jsonb(case when p_si then 'si' else 'no' end)),
                          '{fotos_fecha}', to_jsonb(to_char(now() at time zone 'America/Santiago', 'YYYY-MM-DD'))),
         actualizado = now()
   where comunidad_id = p_comunidad and col = 'ninos' and id = p_nino
     and data->>'familia_uid' = auth.uid()::text;
  if not found then raise exception 'Este niño no está vinculado a tu familia.'; end if;
  return case when p_si then 'si' else 'no' end;
end $$;
revoke all on function public.autorizar_fotos(uuid, text, boolean) from public, anon;
grant execute on function public.autorizar_fotos(uuid, text, boolean) to authenticated;

select 'Listo: fotos privadas instaladas' as resultado;
