-- =====================================================================
-- Eterno Pacto Kids · Mejoras: calendario de material, liberación programada, vencimiento de permisos,
-- solicitudes de acceso, asistencia con QR, práctica del versículo y notificaciones.
-- Se ejecuta DESPUÉS de permisos.sql. Se puede ejecutar más de una vez.
-- =====================================================================
create or replace function public.hoy_cl() returns date language sql stable as $$ select (now() at time zone 'America/Santiago')::date $$;
create or replace function public.fecha_ok(t text) returns date language sql immutable as $$
  select case when t ~ '^\d{4}-\d{2}-\d{2}$' then t::date end $$;

-- ---------- Calendario del material central en cada congregación (lo decide su equipo) ----------
create table if not exists public.visibilidad (
  comunidad_id uuid not null references public.comunidades(id) on delete cascade,
  col text not null, doc_id text not null,
  visible boolean not null default true,
  desde date,
  primary key (comunidad_id, col, doc_id)
);
alter table public.visibilidad enable row level security;
grant select, insert, update, delete on public.visibilidad to authenticated;
drop policy if exists "ver visibilidad" on public.visibilidad;
create policy "ver visibilidad" on public.visibilidad for select using (public.mi_rol(comunidad_id) is not null);
drop policy if exists "equipo maneja visibilidad" on public.visibilidad;
create policy "equipo maneja visibilidad" on public.visibilidad for all using (public.es_equipo(comunidad_id)) with check (public.es_equipo(comunidad_id));

-- ---------- Liberación programada y vencimiento del permiso ----------
alter table public.excepciones add column if not exists desde date;
alter table public.comunidades add column if not exists plan_hasta date;

create or replace function public.super_set_vence(p_comunidad uuid, p_hasta date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_super() then raise exception 'Solo el súper administrador'; end if;
  update public.comunidades set plan_hasta = p_hasta where id = p_comunidad;
end $$;
revoke all on function public.super_set_vence(uuid, date) from public, anon;
grant execute on function public.super_set_vence(uuid, date) to authenticated;

-- Material central para una congregación, con permiso vigente, liberaciones programadas y calendario propio
drop function if exists public.central_para(uuid, text);
create function public.central_para(p_comunidad uuid, p_col text)
returns table (id text, data jsonb, bloqueado boolean, visible boolean, desde date)
language sql stable security definer set search_path = public as $$
  with c as (
    select case when co.plan_hasta is not null and co.plan_hasta < public.hoy_cl() then 0 else coalesce(p.orden, 0) end as orden
    from public.comunidades co left join public.planes p on p.id = co.plan_id where co.id = p_comunidad
  ), q as (
    select d.id, d.data,
           coalesce(case when e.liberado is not null and (e.desde is null or e.desde <= public.hoy_cl()) then e.liberado end,
                    coalesce(pi.orden, 0) <= coalesce((select orden from c), 0)
                    and coalesce(public.fecha_ok(d.data->>'libera_desde'), public.hoy_cl()) <= public.hoy_cl()) as lib,
           coalesce(v.visible, true) as vis, v.desde as vdesde
    from public.docs d
    left join public.planes pi on pi.id = coalesce(d.data->>'plan', 'gratis')
    left join public.excepciones e on e.comunidad_id = p_comunidad and e.col = d.col and e.doc_id = d.id
    left join public.visibilidad v on v.comunidad_id = p_comunidad and v.col = d.col and v.doc_id = d.id
    where d.comunidad_id = public.central_id() and d.col = p_col
      and public.mi_rol(p_comunidad) is not null
      and (p_col <> 'matprofes' or public.es_equipo(p_comunidad))
  )
  select q.id,
         case when q.lib or public.es_super() then q.data
              else jsonb_strip_nulls(jsonb_build_object('titulo', q.data->'titulo', 'numero', q.data->'numero', 'nombre', q.data->'nombre',
                     'desc', q.data->'desc', 'plan', q.data->'plan', 'fecha', q.data->'fecha', 'tipo', q.data->'tipo', 'orden', q.data->'orden',
                     'thumb', q.data->'thumb', 'libera_desde', q.data->'libera_desde')) end,
         not q.lib, q.vis, q.vdesde
  from q
  where public.es_equipo(p_comunidad) or (q.vis and (q.vdesde is null or q.vdesde <= public.hoy_cl()))
$$;
revoke all on function public.central_para(uuid, text) from public, anon;
grant execute on function public.central_para(uuid, text) to authenticated;

-- ---------- Solicitudes de acceso al material con candado ----------
create table if not exists public.solicitudes (
  id uuid primary key default gen_random_uuid(),
  comunidad_id uuid not null references public.comunidades(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  col text, doc_id text, titulo text,
  mensaje text check (mensaje is null or char_length(mensaje) <= 500),
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
  creado timestamptz not null default now(),
  respondido timestamptz
);
alter table public.solicitudes enable row level security;
grant select, insert, update, delete on public.solicitudes to authenticated;
drop policy if exists "ver solicitudes" on public.solicitudes;
create policy "ver solicitudes" on public.solicitudes for select using (public.es_super() or public.es_equipo(comunidad_id));
drop policy if exists "pedir acceso" on public.solicitudes;
create policy "pedir acceso" on public.solicitudes for insert with check (public.mi_rol(comunidad_id) = 'admin' and user_id = auth.uid() and estado = 'pendiente');
drop policy if exists "super responde" on public.solicitudes;
create policy "super responde" on public.solicitudes for update using (public.es_super()) with check (public.es_super());
drop policy if exists "super borra solicitudes" on public.solicitudes;
create policy "super borra solicitudes" on public.solicitudes for delete using (public.es_super());

-- ---------- Asistencia con código QR ----------
create or replace function public.registrar_asistencia(p_comunidad uuid, p_clase text, p_token text, p_ninos text[])
returns int language plpgsql security definer set search_path = public as $$
declare cl jsonb; a jsonb; actual text[]; validos text[];
begin
  if public.mi_rol(p_comunidad) is null then raise exception 'No perteneces a esta congregación'; end if;
  select data into cl from public.docs where comunidad_id = p_comunidad and col = 'clases' and id = p_clase;
  if cl is null or coalesce(cl->>'qr', '') = '' or cl->>'qr' <> p_token then raise exception 'El código QR no es válido'; end if;
  if public.fecha_ok(cl->>'fecha') is null or abs(public.fecha_ok(cl->>'fecha') - public.hoy_cl()) > 1 then raise exception 'Este código QR es de otro día'; end if;
  select coalesce(array_agg(id), '{}') into validos from public.docs where comunidad_id = p_comunidad and col = 'ninos' and id = any(p_ninos);
  if coalesce(array_length(validos, 1), 0) = 0 then raise exception 'Elige al menos un niño'; end if;
  select data into a from public.docs where comunidad_id = p_comunidad and col = 'asistencia' and id = p_clase;
  a := coalesce(a, '{}'::jsonb);
  select coalesce(array_agg(x), '{}') into actual from jsonb_array_elements_text(case when jsonb_typeof(a->'presente') = 'array' then a->'presente' else '[]'::jsonb end) x;
  a := jsonb_set(a, '{presente}', to_jsonb(array(select distinct unnest(actual || validos))));
  insert into public.docs (comunidad_id, col, id, data, actualizado) values (p_comunidad, 'asistencia', p_clase, a, now())
    on conflict (comunidad_id, col, id) do update set data = excluded.data, actualizado = now();
  return array_length(validos, 1);
end $$;
revoke all on function public.registrar_asistencia(uuid, text, text, text[]) from public, anon;
grant execute on function public.registrar_asistencia(uuid, text, text, text[]) to authenticated;

-- ---------- Cuántas familias practicaron el versículo de una clase (solo el número, para el equipo) ----------
create or replace function public.practica_versiculo(p_comunidad uuid, p_clase text)
returns table (familias int, perfiles int) language sql stable security definer set search_path = public as $$
  select count(distinct f.user_id)::int, count(*)::int
  from public.miembros m join public.familias f on f.user_id = m.user_id
  cross join lateral jsonb_each(case when jsonb_typeof(f.data->'lectores') = 'object' then f.data->'lectores' else '{}'::jsonb end) l
  where m.comunidad_id = p_comunidad and public.es_equipo(p_comunidad)
    and jsonb_typeof(l.value) = 'object' and (l.value->'versos') ? p_clase
$$;
revoke all on function public.practica_versiculo(uuid, text) from public, anon;
grant execute on function public.practica_versiculo(uuid, text) to authenticated;

-- ---------- Notificaciones ----------
create table if not exists public.push_subs (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh text not null, auth text not null,
  creado timestamptz not null default now()
);
alter table public.push_subs enable row level security;
grant select, insert, update, delete on public.push_subs to authenticated;
drop policy if exists "mis avisos" on public.push_subs;
create policy "mis avisos" on public.push_subs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.notif_pref (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  push boolean not null default true,
  correo boolean not null default true,
  recordatorio boolean not null default true
);
alter table public.notif_pref enable row level security;
grant select, insert, update on public.notif_pref to authenticated;
drop policy if exists "mis preferencias" on public.notif_pref;
create policy "mis preferencias" on public.notif_pref for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Registro de lo ya avisado (solo lo usa el servidor)
create table if not exists public.notificados (
  tipo text not null, ref text not null, creado timestamptz not null default now(),
  primary key (tipo, ref)
);
alter table public.notificados enable row level security;
revoke all on public.notificados from anon, authenticated;
-- Las clases que ya existen no se vuelven a anunciar
insert into public.notificados (tipo, ref) select 'clase', comunidad_id || '/' || id from public.docs where col = 'clases' on conflict do nothing;

-- ---------- Cuentos y materiales propios también pueden ocultarse o programarse ----------
drop policy if exists "leer contenido" on public.docs;
create policy "leer contenido" on public.docs for select using (
  public.mi_rol(comunidad_id) is not null
  and (comunidad_id <> public.central_id() or public.es_super())
  and (col not in ('libro','matprofes') or public.es_equipo(comunidad_id))
  and (col not in ('clases','cuentos','materiales') or public.es_equipo(comunidad_id)
       or (coalesce(data->>'visible', 'si') <> 'no'
           and coalesce(data->>'publicar', '') <= to_char(now() at time zone 'America/Santiago', 'YYYY-MM-DD')))
);

select 'Listo: mejoras instaladas' as resultado;
