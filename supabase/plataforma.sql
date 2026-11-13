-- =====================================================================
-- Eterno Pacto Kids · Plataforma: planes y bloqueo, clases visibles, foros y retos
-- Se ejecuta DESPUÉS de schema.sql y panel.sql. Se puede ejecutar más de una vez.
-- =====================================================================

-- =============== 1. PLANES Y BLOQUEO DE MATERIAL ===============
create table if not exists public.planes (
  id text primary key,
  nombre text not null,
  orden int not null default 0,
  descripcion text
);
insert into public.planes (id, nombre, orden, descripcion) values
  ('gratis', 'Gratis', 0, 'Material abierto para todas las congregaciones'),
  ('basico', 'Básico', 1, 'Material del plan Básico'),
  ('completo', 'Completo', 2, 'Todo el material de la biblioteca central')
on conflict (id) do nothing;
alter table public.planes enable row level security;
drop policy if exists "todos ven planes" on public.planes;
create policy "todos ven planes" on public.planes for select to authenticated using (true);
drop policy if exists "super edita planes" on public.planes;
create policy "super edita planes" on public.planes for all to authenticated using (public.es_super()) with check (public.es_super());
grant select, insert, update, delete on public.planes to authenticated;

alter table public.comunidades add column if not exists plan_id text references public.planes(id) on update cascade on delete set null default 'gratis';
update public.comunidades set plan_id = 'gratis' where plan_id is null and id <> public.central_id();

-- Los administradores pueden editar los datos de su congregación, pero no su plan
revoke update on public.comunidades from authenticated;
grant update (nombre, ciudad, region, pais) on public.comunidades to authenticated;

create table if not exists public.excepciones (
  comunidad_id uuid not null references public.comunidades(id) on delete cascade,
  col text not null,
  doc_id text not null,
  liberado boolean not null,
  primary key (comunidad_id, col, doc_id)
);
alter table public.excepciones enable row level security;
drop policy if exists "super maneja excepciones" on public.excepciones;
create policy "super maneja excepciones" on public.excepciones for all to authenticated using (public.es_super()) with check (public.es_super());
grant select, insert, update, delete on public.excepciones to authenticated;

create or replace function public.super_set_plan(p_comunidad uuid, p_plan text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_super() then raise exception 'Solo el súper administrador'; end if;
  update public.comunidades set plan_id = p_plan where id = p_comunidad;
end $$;

-- Material de la biblioteca central para una congregación: lo bloqueado se ve, pero sin archivo
create or replace function public.central_para(p_comunidad uuid, p_col text)
returns table (id text, data jsonb, bloqueado boolean)
language sql stable security definer set search_path = public as $$
  with c as (
    select coalesce((select p.orden from public.comunidades co left join public.planes p on p.id = co.plan_id where co.id = p_comunidad), 0) as orden
  )
  select d.id,
         case when x.lib or public.es_super() then d.data
              else jsonb_strip_nulls(jsonb_build_object('titulo', d.data->'titulo', 'numero', d.data->'numero', 'nombre', d.data->'nombre',
                     'desc', d.data->'desc', 'plan', d.data->'plan', 'fecha', d.data->'fecha', 'tipo', d.data->'tipo', 'orden', d.data->'orden')) end,
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

-- =============== 2. CLASES VISIBLES PARA LAS FAMILIAS ===============
-- La biblioteca central ya no se lee directamente (solo con central_para); las clases ocultas
-- o programadas no las ven las familias.
drop policy if exists "leer contenido" on public.docs;
create policy "leer contenido" on public.docs for select using (
  public.mi_rol(comunidad_id) is not null
  and (comunidad_id <> public.central_id() or public.es_super())
  and (col not in ('libro','matprofes') or public.es_equipo(comunidad_id))
  and (col <> 'clases' or public.es_equipo(comunidad_id)
       or (coalesce(data->>'visible', 'si') <> 'no'
           and coalesce(data->>'publicar', '') <= to_char(now() at time zone 'America/Santiago', 'YYYY-MM-DD')))
);

-- =============== 3. FOROS ===============
create table if not exists public.foros (
  id uuid primary key default gen_random_uuid(),
  comunidad_id uuid references public.comunidades(id) on delete cascade,
  padre_id uuid references public.foros(id) on delete cascade,
  nombre text not null check (char_length(nombre) between 2 and 80),
  descripcion text,
  lectura text not null default 'miembros' check (lectura in ('todos','miembros','equipo','admins','super')),
  escritura text not null default 'miembros' check (escritura in ('todos','miembros','equipo','admins','super')),
  ninos boolean not null default false,
  orden int not null default 0,
  creado_por uuid default auth.uid() references auth.users(id) on delete set null,
  creado timestamptz not null default now()
);
create table if not exists public.temas (
  id uuid primary key default gen_random_uuid(),
  foro_id uuid not null references public.foros(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 2 and 140),
  autor_id uuid default auth.uid() references auth.users(id) on delete set null,
  autor text,
  fijado boolean not null default false,
  cerrado boolean not null default false,
  mensajes int not null default 0,
  creado timestamptz not null default now(),
  ultimo timestamptz not null default now()
);
create index if not exists temas_foro_idx on public.temas (foro_id, ultimo desc);
create table if not exists public.mensajes (
  id uuid primary key default gen_random_uuid(),
  tema_id uuid not null references public.temas(id) on delete cascade,
  autor_id uuid default auth.uid() references auth.users(id) on delete set null,
  autor text,
  como text,
  es_nino boolean not null default false,
  texto text not null check (char_length(texto) between 1 and 5000),
  estado text not null default 'publicado' check (estado in ('publicado','pendiente','oculto')),
  reportes int not null default 0,
  creado timestamptz not null default now()
);
create index if not exists mensajes_tema_idx on public.mensajes (tema_id, creado);

create or replace function public.nivel_ok(p_comunidad uuid, p_nivel text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.es_super() then true
    when not public.usuario_activo() then false
    when p_nivel = 'todos' then true
    when p_nivel = 'super' then false
    when p_comunidad is not null then case p_nivel
      when 'miembros' then public.mi_rol(p_comunidad) is not null
      when 'equipo' then public.es_equipo(p_comunidad)
      when 'admins' then public.mi_rol(p_comunidad) = 'admin' else false end
    else case p_nivel
      when 'miembros' then exists (select 1 from public.miembros where user_id = auth.uid())
      when 'equipo' then public.es_equipo_alguna()
      when 'admins' then exists (select 1 from public.miembros where user_id = auth.uid() and rol = 'admin') else false end
  end
$$;
create or replace function public.modera_foro(p_foro uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_super() or exists (select 1 from public.foros f where f.id = p_foro and f.comunidad_id is not null and public.es_equipo(f.comunidad_id))
$$;
create or replace function public.lee_foro(p_foro uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.foros f where f.id = p_foro and public.nivel_ok(f.comunidad_id, f.lectura))
$$;
create or replace function public.escribe_foro(p_foro uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.foros f where f.id = p_foro and public.nivel_ok(f.comunidad_id, f.lectura) and public.nivel_ok(f.comunidad_id, f.escritura))
$$;

-- Autor, estado y contadores los pone la base de datos (no se pueden falsear)
create or replace function public.antes_tema()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.autor_id := auth.uid();
  new.autor := coalesce(nullif((select nombre from public.perfiles where id = auth.uid()), ''), 'Usuario');
  new.mensajes := 0; new.fijado := coalesce(new.fijado, false) and public.modera_foro(new.foro_id);
  new.cerrado := false; new.creado := now(); new.ultimo := now();
  return new;
end $$;
drop trigger if exists antes_tema on public.temas;
create trigger antes_tema before insert on public.temas for each row execute function public.antes_tema();

create or replace function public.antes_mensaje()
returns trigger language plpgsql security definer set search_path = public as $$
declare f public.foros; t public.temas;
begin
  select * into t from public.temas where id = new.tema_id;
  select * into f from public.foros where id = t.foro_id;
  if t.cerrado and not public.modera_foro(f.id) then raise exception 'Este tema está cerrado'; end if;
  if new.es_nino and (f.comunidad_id is null or not f.ninos) then raise exception 'Los niños solo pueden escribir en los foros de su congregación que lo permiten'; end if;
  new.autor_id := auth.uid();
  new.autor := coalesce(nullif((select nombre from public.perfiles where id = auth.uid()), ''), 'Usuario');
  new.como := nullif(left(trim(coalesce(new.como, '')), 40), '');
  new.estado := case when new.es_nino then 'pendiente' else 'publicado' end;
  new.reportes := 0; new.creado := now();
  return new;
end $$;
drop trigger if exists antes_mensaje on public.mensajes;
create trigger antes_mensaje before insert on public.mensajes for each row execute function public.antes_mensaje();

create or replace function public.despues_mensaje()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.temas set mensajes = (select count(*) from public.mensajes where tema_id = coalesce(new.tema_id, old.tema_id) and estado = 'publicado'),
                          ultimo = greatest(ultimo, coalesce(new.creado, ultimo))
   where id = coalesce(new.tema_id, old.tema_id);
  return null;
end $$;
drop trigger if exists despues_mensaje on public.mensajes;
create trigger despues_mensaje after insert or update or delete on public.mensajes for each row execute function public.despues_mensaje();

alter table public.foros enable row level security;
alter table public.temas enable row level security;
alter table public.mensajes enable row level security;
grant select, insert, update, delete on public.foros, public.temas, public.mensajes to authenticated;

drop policy if exists "ver foros" on public.foros;
create policy "ver foros" on public.foros for select using (public.nivel_ok(comunidad_id, lectura));
drop policy if exists "crear foros" on public.foros;
create policy "crear foros" on public.foros for insert with check (public.es_super() or (comunidad_id is not null and public.mi_rol(comunidad_id) = 'admin'));
drop policy if exists "editar foros" on public.foros;
create policy "editar foros" on public.foros for update using (public.es_super() or (comunidad_id is not null and public.mi_rol(comunidad_id) = 'admin'))
  with check (public.es_super() or (comunidad_id is not null and public.mi_rol(comunidad_id) = 'admin'));
drop policy if exists "borrar foros" on public.foros;
create policy "borrar foros" on public.foros for delete using (public.es_super() or (comunidad_id is not null and public.mi_rol(comunidad_id) = 'admin'));

drop policy if exists "ver temas" on public.temas;
create policy "ver temas" on public.temas for select using (public.lee_foro(foro_id));
drop policy if exists "crear temas" on public.temas;
create policy "crear temas" on public.temas for insert with check (public.escribe_foro(foro_id));
drop policy if exists "moderar temas" on public.temas;
create policy "moderar temas" on public.temas for update using (public.modera_foro(foro_id)) with check (public.modera_foro(foro_id));
drop policy if exists "borrar temas" on public.temas;
create policy "borrar temas" on public.temas for delete using (public.modera_foro(foro_id) or autor_id = auth.uid());

drop policy if exists "ver mensajes" on public.mensajes;
create policy "ver mensajes" on public.mensajes for select using (
  exists (select 1 from public.temas t where t.id = tema_id and public.lee_foro(t.foro_id)
          and (estado = 'publicado' or autor_id = auth.uid() or public.modera_foro(t.foro_id))));
drop policy if exists "escribir mensajes" on public.mensajes;
create policy "escribir mensajes" on public.mensajes for insert with check (
  exists (select 1 from public.temas t where t.id = tema_id and public.escribe_foro(t.foro_id)));
drop policy if exists "moderar mensajes" on public.mensajes;
create policy "moderar mensajes" on public.mensajes for update using (
  exists (select 1 from public.temas t where t.id = tema_id and public.modera_foro(t.foro_id)))
  with check (exists (select 1 from public.temas t where t.id = tema_id and public.modera_foro(t.foro_id)));
drop policy if exists "borrar mensajes" on public.mensajes;
create policy "borrar mensajes" on public.mensajes for delete using (
  autor_id = auth.uid() or exists (select 1 from public.temas t where t.id = tema_id and public.modera_foro(t.foro_id)));

create or replace function public.reportar_mensaje(p_mensaje uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.mensajes m join public.temas t on t.id = m.tema_id where m.id = p_mensaje and public.lee_foro(t.foro_id)) then
    raise exception 'Mensaje no encontrado';
  end if;
  update public.mensajes set reportes = reportes + 1 where id = p_mensaje;
end $$;

-- Foros iniciales
insert into public.foros (comunidad_id, nombre, descripcion, lectura, escritura, ninos, orden)
select null, x.nombre, x.descripcion, x.lectura, x.escritura, false, x.orden
from (values ('Comunidad Eterno Pacto Kids', 'Conversación general entre las familias y maestros de todas las congregaciones.', 'todos', 'todos', 1),
             ('Maestros y administradores', 'Ideas, materiales y experiencias para enseñar a los niños.', 'equipo', 'equipo', 2),
             ('Administradores', 'Coordinación entre los administradores de las congregaciones.', 'admins', 'admins', 3)) x(nombre, descripcion, lectura, escritura, orden)
where not exists (select 1 from public.foros f where f.comunidad_id is null and f.nombre = x.nombre);

insert into public.foros (comunidad_id, nombre, descripcion, lectura, escritura, ninos, orden)
select c.id, x.nombre, x.descripcion, x.lectura, x.escritura, x.ninos, x.orden
from public.comunidades c
cross join (values ('Foro de la congregación', 'Conversaciones, avisos y oraciones de toda la congregación.', 'miembros', 'miembros', true, 1),
                   ('Equipo de maestros', 'Coordinación de clases y materiales del equipo.', 'equipo', 'equipo', false, 2)) x(nombre, descripcion, lectura, escritura, ninos, orden)
where c.id <> public.central_id()
  and not exists (select 1 from public.foros f where f.comunidad_id = c.id and f.nombre = x.nombre);

-- =============== 4. RETOS Y DESAFÍOS ===============
create table if not exists public.retos (
  id uuid primary key default gen_random_uuid(),
  comunidad_id uuid not null references public.comunidades(id) on delete cascade,
  tipo text not null check (tipo in ('familias','congregacion')),
  creado_por uuid not null default auth.uid() references auth.users(id) on delete cascade,
  retado uuid references auth.users(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 2 and 120),
  descripcion text,
  metrica text not null check (metrica in ('lecturas','cuentos','historias','capitulos','actividades','versiculos')),
  meta int check (meta is null or meta > 0),
  dias int not null default 7 check (dias between 1 and 120),
  inicio date not null default (now() at time zone 'America/Santiago')::date,
  fin date not null,
  estado text not null default 'activo' check (estado in ('pendiente','activo','rechazado','cancelado')),
  creado timestamptz not null default now()
);
alter table public.retos enable row level security;
grant select, insert on public.retos to authenticated;

create or replace function public.antes_reto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.creado_por := auth.uid();
  new.inicio := (now() at time zone 'America/Santiago')::date;
  new.fin := new.inicio + new.dias - 1;
  if new.tipo = 'congregacion' then
    if not public.es_equipo(new.comunidad_id) then raise exception 'Solo maestros y administradores crean desafíos de congregación'; end if;
    new.retado := null; new.estado := 'activo';
  else
    if public.mi_rol(new.comunidad_id) is null then raise exception 'No perteneces a esta congregación'; end if;
    if new.retado is null or new.retado = auth.uid() or not exists (select 1 from public.miembros where comunidad_id = new.comunidad_id and user_id = new.retado) then
      raise exception 'Elige otra familia de tu congregación';
    end if;
    new.estado := 'pendiente';
  end if;
  return new;
end $$;
drop trigger if exists antes_reto on public.retos;
create trigger antes_reto before insert on public.retos for each row execute function public.antes_reto();

drop policy if exists "ver retos" on public.retos;
create policy "ver retos" on public.retos for select using (
  public.mi_rol(comunidad_id) is not null and (tipo = 'congregacion' or auth.uid() in (creado_por, retado) or public.es_equipo(comunidad_id)));
drop policy if exists "crear retos" on public.retos;
create policy "crear retos" on public.retos for insert with check (public.mi_rol(comunidad_id) is not null);

create or replace function public.responder_reto(p_reto uuid, p_acepta boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r public.retos;
begin
  select * into r from public.retos where id = p_reto;
  if r.id is null or r.retado is distinct from auth.uid() or r.estado <> 'pendiente' then raise exception 'Este reto ya no espera tu respuesta'; end if;
  if p_acepta then
    update public.retos set estado = 'activo', inicio = (now() at time zone 'America/Santiago')::date,
           fin = (now() at time zone 'America/Santiago')::date + dias - 1 where id = p_reto;
  else
    update public.retos set estado = 'rechazado' where id = p_reto;
  end if;
end $$;

create or replace function public.cancelar_reto(p_reto uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.retos;
begin
  select * into r from public.retos where id = p_reto;
  if r.id is null or not (r.creado_por = auth.uid() or public.es_equipo(r.comunidad_id)) then raise exception 'No puedes cancelar este reto'; end if;
  update public.retos set estado = 'cancelado' where id = p_reto;
end $$;

create or replace function public.contar_fechas(p_obj jsonb, p_ini date, p_fin date)
returns int language sql immutable as $$
  select case when jsonb_typeof(p_obj) = 'object' then
    (select count(*)::int from jsonb_each_text(p_obj) x where left(x.value, 10) between p_ini::text and p_fin::text)
  else 0 end
$$;
create or replace function public.puntaje_familia(p_data jsonb, p_metrica text, p_ini date, p_fin date)
returns int language sql immutable as $$
  select coalesce(sum(
      case when p_metrica in ('cuentos','lecturas') then public.contar_fechas(l.value->'cuentos', p_ini, p_fin) else 0 end
    + case when p_metrica in ('historias','lecturas') then public.contar_fechas(l.value->'plan', p_ini, p_fin) else 0 end
    + case when p_metrica in ('capitulos','lecturas') then public.contar_fechas(l.value->'leidos', p_ini, p_fin) else 0 end
    + case when p_metrica in ('actividades','lecturas') then public.contar_fechas(l.value->'mats', p_ini, p_fin) else 0 end
    + case when p_metrica = 'versiculos' and jsonb_typeof(l.value->'favs') = 'array' then
        (select count(*)::int from jsonb_array_elements(l.value->'favs') f where left(f->>'fecha', 10) between p_ini::text and p_fin::text) else 0 end
  ), 0)::int
  from jsonb_each(case when jsonb_typeof(p_data->'lectores') = 'object' then p_data->'lectores' else '{}'::jsonb end) l
  where jsonb_typeof(l.value) = 'object'
$$;

create or replace function public.reto_tablero(p_reto uuid)
returns table (user_id uuid, familia text, puntaje int, es_mia boolean)
language plpgsql stable security definer set search_path = public as $$
declare r public.retos;
begin
  select * into r from public.retos where id = p_reto;
  if r.id is null then return; end if;
  if not (public.es_super() or (public.mi_rol(r.comunidad_id) is not null and (r.tipo = 'congregacion' or auth.uid() in (r.creado_por, r.retado) or public.es_equipo(r.comunidad_id)))) then
    raise exception 'Sin acceso a este reto';
  end if;
  return query
    select m.user_id,
           coalesce(nullif(f.data->'familia'->>'nombre', ''), nullif(p.nombre, ''), 'Familia')::text,
           public.puntaje_familia(coalesce(f.data, '{}'::jsonb), r.metrica, r.inicio, r.fin),
           m.user_id = auth.uid()
    from public.miembros m
    left join public.familias f on f.user_id = m.user_id
    left join public.perfiles p on p.id = m.user_id
    where m.comunidad_id = r.comunidad_id
      and (case when r.tipo = 'familias' then m.user_id in (r.creado_por, r.retado) else (m.rol = 'familia' or f.user_id is not null) end)
    order by 3 desc, 2;
end $$;

create or replace function public.familias_de(p_comunidad uuid)
returns table (user_id uuid, familia text)
language sql stable security definer set search_path = public as $$
  select m.user_id, coalesce(nullif(f.data->'familia'->>'nombre', ''), nullif(p.nombre, ''), 'Familia')::text
  from public.miembros m
  left join public.familias f on f.user_id = m.user_id
  left join public.perfiles p on p.id = m.user_id
  where m.comunidad_id = p_comunidad and m.user_id <> auth.uid() and public.mi_rol(p_comunidad) is not null
    and not coalesce(p.suspendido, false)
  order by 2
$$;

revoke all on function public.super_set_plan(uuid, text) from public, anon;
revoke all on function public.central_para(uuid, text) from public, anon;
revoke all on function public.reportar_mensaje(uuid) from public, anon;
revoke all on function public.responder_reto(uuid, boolean) from public, anon;
revoke all on function public.cancelar_reto(uuid) from public, anon;
revoke all on function public.reto_tablero(uuid) from public, anon;
revoke all on function public.familias_de(uuid) from public, anon;
grant execute on function public.super_set_plan(uuid, text) to authenticated;
grant execute on function public.central_para(uuid, text) to authenticated;
grant execute on function public.reportar_mensaje(uuid) to authenticated;
grant execute on function public.responder_reto(uuid, boolean) to authenticated;
grant execute on function public.cancelar_reto(uuid) to authenticated;
grant execute on function public.reto_tablero(uuid) to authenticated;
grant execute on function public.familias_de(uuid) to authenticated;

-- =============== Congregaciones nuevas: plan Gratis, museo, carta y foros ===============
create or replace function public.crear_comunidad(p_nombre text, p_ciudad text default null, p_region text default null, p_pais text default 'Chile')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_codigo text;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if exists (select 1 from public.perfiles where id = auth.uid() and suspendido) then raise exception 'Tu cuenta está suspendida'; end if;
  if not public.es_super() and (select count(*) from public.comunidades where creada_por = auth.uid()) >= 5 then
    raise exception 'Ya creaste el máximo de congregaciones';
  end if;
  loop
    v_codigo := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.comunidades where codigo = v_codigo);
  end loop;
  insert into public.comunidades (nombre, codigo, creada_por, ciudad, region, pais)
    values (trim(p_nombre), v_codigo, auth.uid(), nullif(trim(p_ciudad), ''), nullif(trim(p_region), ''), coalesce(nullif(trim(p_pais), ''), 'Chile'))
    returning id into v_id;
  insert into public.miembros (comunidad_id, user_id, rol) values (v_id, auth.uid(), 'admin');
  -- Contenido inicial: museo de parábolas copiado de la biblioteca central
  insert into public.docs (comunidad_id, col, id, data)
    select v_id, 'parabolas', d.id, d.data from public.docs d
    where d.comunidad_id = public.central_id() and d.col = 'parabolas'
    on conflict do nothing;
  -- Carta de compromiso del 4 de octubre (solo Eterno Pacto)
  if p_nombre ilike '%eterno pacto%' then
    insert into public.docs (comunidad_id, col, id, data)
      select v_id, 'compromisos', e->>'id', e - 'id' from jsonb_array_elements($j$[{"cierre": "También les pedimos que continúen orando por nosotros. Necesitamos de su guía, su ejemplo y su apoyo para seguir creciendo en la fe y llegar a ser hombres y mujeres que honren a Dios con sus vidas.\nDeseamos que, juntos, niños y adultos, sigamos construyendo una iglesia fuerte, unida y llena del amor de Cristo.\nCon gratitud y alegría, ponemos este compromiso en las manos de nuestro Señor Jesús.", "compromisos": "Escuchar y aprender la Palabra de Dios con alegría y respeto.\nOrar cada día y confiar en Jesús en todo momento.\nTratar a los demás con amor, bondad y respeto.\nSer obedientes a nuestros padres, maestros y líderes.\nAyudar a quienes nos necesiten y compartir el amor de Cristo con otros niños.\nCuidar la iglesia y participar con entusiasmo en las actividades que Dios nos permita realizar.\nSeguir creciendo para ser discípulos de Jesús que reflejen Su luz en la escuela, en nuestros hogares y en la comunidad.", "fecha": "2026-10-04", "firma": "Con amor, los niños de Eterno Pacto KIDS", "firmantes": "", "intro": "Con mucho cariño queremos dirigirles estas palabras como niños que formamos parte de esta hermosa familia de fe.\nAntes que todo, les damos gracias por recibirnos, enseñarnos y acompañarnos en nuestro crecimiento espiritual. Gracias por sus oraciones, sus consejos, su ejemplo y por hacernos sentir amados y valorados dentro de la iglesia.\nHoy queremos hacer un compromiso delante de Dios y de ustedes. Nos comprometemos a:", "saludo": "Querida Familia:", "titulo": "Carta de Compromiso de los Niños a la Congregación", "versiculo": "\"Ninguno tenga en poco tu juventud, sino sé ejemplo de los creyentes.\"", "versiculoCita": "1 Timoteo 4:12", "id": "carta-2026-10-04"}]$j$::jsonb) e
      on conflict do nothing;
  end if;
  -- Foros de la congregación
  insert into public.foros (comunidad_id, nombre, descripcion, lectura, escritura, ninos, orden)
  values (v_id, 'Foro de la congregación', 'Conversaciones, avisos y oraciones de toda la congregación.', 'miembros', 'miembros', true, 1),
         (v_id, 'Equipo de maestros', 'Coordinación de clases y materiales del equipo.', 'equipo', 'equipo', false, 2);
  return v_id;
end $$;

select 'Listo: planes, foros y retos instalados' as resultado;
