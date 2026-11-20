-- ============================================================
-- Álbum Bíblico: 100 láminas, sobres de 4, intercambio y chat del patio
-- Ejecutar una vez en Supabase → SQL Editor (después de desafios.sql).
--
-- Reglas:
--   · Todo suma PUNTOS: asistencia y criterios del domingo (con el valor que fije
--     cada congregación), estrellas extra del maestro, desafíos diarios y
--     actividades de la app (cuentos 5, historias 5, versículos 5, quiz 5,
--     material 3, museo 3, personajes 3, capítulos 2; máximo 40 al día).
--   · El niño cambia puntos por sobres cuando quiera (precio en config/general
--     → precioSobre, 50 puntos por defecto).
--   · El maestro también puede regalar sobres (con motivo).
--   · Cada sobre trae 5 láminas, con al menos 1 nueva mientras falten.
--   · Solo se intercambian láminas repetidas (mercado de láminas del foro).
-- El catálogo (nombre, imagen y ficha de cada lámina) vive en la biblioteca
-- central: docs col 'laminas', id 'lamina-001' … 'lamina-100'.
-- ============================================================

create or replace function public.album_reglas()
returns table (total int, por_sobre int, desafios_por_sobre int)
language sql immutable as $$ select 100, 5, 3 $$;

create table if not exists public.album_laminas (
  comunidad_id uuid not null references public.comunidades(id) on delete cascade,
  nino_id text not null,
  lamina int not null check (lamina between 1 and 500),
  cantidad int not null default 0 check (cantidad >= 0),
  primera timestamptz not null default now(),
  primary key (comunidad_id, nino_id, lamina)
);
create table if not exists public.album_sobres (
  comunidad_id uuid not null references public.comunidades(id) on delete cascade,
  nino_id text not null,
  abiertos int not null default 0,
  extra int not null default 0,
  primary key (comunidad_id, nino_id)
);
alter table public.album_sobres add column if not exists comprados int not null default 0;
alter table public.album_sobres add column if not exists puntos_gastados int not null default 0;
create table if not exists public.album_actividad (
  comunidad_id uuid not null references public.comunidades(id) on delete cascade,
  nino_id text not null,
  tipo text not null,
  ref text not null,
  pts int not null,
  fecha date not null default current_date,
  primary key (comunidad_id, nino_id, tipo, ref)
);
create table if not exists public.album_regalos (
  id uuid primary key default gen_random_uuid(),
  comunidad_id uuid not null references public.comunidades(id) on delete cascade,
  nino_id text not null,
  cantidad int not null,
  motivo text,
  por uuid,
  creado timestamptz not null default now()
);
create table if not exists public.album_intercambios (
  id uuid primary key default gen_random_uuid(),
  comunidad_id uuid not null references public.comunidades(id) on delete cascade,
  de_nino text not null,
  para_nino text not null,
  ofrece int not null,
  pide int not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','aceptado','rechazado','cancelado')),
  creado timestamptz not null default now(),
  resuelto timestamptz
);
create index if not exists album_int_idx on public.album_intercambios (comunidad_id, estado, creado desc);
create table if not exists public.album_chat (
  id uuid primary key default gen_random_uuid(),
  comunidad_id uuid not null references public.comunidades(id) on delete cascade,
  nino_id text,
  autor text not null,
  texto text not null check (char_length(texto) between 1 and 200),
  tipo text not null default 'texto' check (tipo in ('texto','sistema')),
  estado text not null default 'publicado' check (estado in ('publicado','oculto')),
  reportes int not null default 0,
  creado timestamptz not null default now()
);
create index if not exists album_chat_idx on public.album_chat (comunidad_id, creado desc);

alter table public.album_laminas enable row level security;
alter table public.album_sobres enable row level security;
alter table public.album_intercambios enable row level security;
alter table public.album_chat enable row level security;
alter table public.album_actividad enable row level security;
alter table public.album_regalos enable row level security;
drop policy if exists "actividad ver" on public.album_actividad;
create policy "actividad ver" on public.album_actividad for select using (public.mi_rol(comunidad_id) is not null);
drop policy if exists "regalos ver" on public.album_regalos;
create policy "regalos ver" on public.album_regalos for select using (public.mi_rol(comunidad_id) is not null);

-- Lectura: los miembros de la congregación ven los álbumes (para saber quién tiene repetidas),
-- los intercambios y el chat publicado. Nadie escribe directo: solo con las funciones de abajo.
drop policy if exists "album ver" on public.album_laminas;
create policy "album ver" on public.album_laminas for select using (public.mi_rol(comunidad_id) is not null);
drop policy if exists "sobres ver" on public.album_sobres;
create policy "sobres ver" on public.album_sobres for select using (public.mi_rol(comunidad_id) is not null);
drop policy if exists "intercambios ver" on public.album_intercambios;
create policy "intercambios ver" on public.album_intercambios for select using (public.mi_rol(comunidad_id) is not null);
drop policy if exists "chat ver" on public.album_chat;
create policy "chat ver" on public.album_chat for select using (
  public.mi_rol(comunidad_id) is not null and (estado = 'publicado' or public.es_equipo(comunidad_id)));

do $$ begin alter publication supabase_realtime add table public.album_chat; exception when duplicate_object then null; when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.album_intercambios; exception when duplicate_object then null; when others then null; end $$;

-- ¿Este niño es de mi familia (o soy del equipo)?
create or replace function public.nino_mio(p_comunidad uuid, p_nino text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_equipo(p_comunidad) or exists (
    select 1 from public.docs n where n.comunidad_id = p_comunidad and n.col = 'ninos' and n.id = p_nino
      and n.data->>'familia_uid' = auth.uid()::text)
$$;
create or replace function public.nombre_nino(p_comunidad uuid, p_nino text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(split_part(trim(data->>'nombre'), ' ', 1), 'Alguien') from public.docs
  where comunidad_id = p_comunidad and col = 'ninos' and id = p_nino
$$;

drop function if exists public.album_ganados(uuid, text);
drop function if exists public.album_estado(uuid);
drop function if exists public.regalar_sobre(uuid, text, int);

-- Puntos ganados en total por un niño (lo mismo que muestra la app)
create or replace function public.album_pts(p_comunidad uuid, p_nino text)
returns int language plpgsql stable security definer set search_path = public as $$
declare
  v_def jsonb := '{"presente":10,"versiculo":15,"biblia":5,"tarea":10,"material":5,"conducta":5,"participa":5}';
  v_cfg jsonb; v_w jsonb := '{}'; k text; w int; e jsonb; v_tot numeric := 0;
begin
  select data->'criterios' into v_cfg from public.docs where comunidad_id = p_comunidad and col = 'config' and id = 'general';
  for k, w in select key, value::int from jsonb_each_text(v_def) loop v_w := v_w || jsonb_build_object(k, w); end loop;
  if jsonb_typeof(v_cfg) = 'array' then
    for e in select * from jsonb_array_elements(v_cfg) loop
      if e ? 'k' then
        v_w := v_w || jsonb_build_object(e->>'k', case when (e->>'on') = 'false' then 0
                                                       else coalesce(nullif(e->>'p','')::numeric, (v_def->>(e->>'k'))::numeric, 0) end);
      end if;
    end loop;
  end if;
  for k, w in select key, coalesce(nullif(value,'')::numeric,0)::int from jsonb_each_text(v_w) loop
    if w <> 0 then
      v_tot := v_tot + w * (select count(*) from public.docs a where a.comunidad_id = p_comunidad and a.col = 'asistencia'
                              and jsonb_typeof(a.data->k) = 'array' and (a.data->k) ? p_nino);
    end if;
  end loop;
  v_tot := v_tot + coalesce((select sum(case when (b.data->>'pts') ~ '^-?\d+(\.\d+)?$' then (b.data->>'pts')::numeric else 0 end)
                             from public.docs b where b.comunidad_id = p_comunidad and b.col = 'bonos' and b.data->>'ninoId' = p_nino), 0);
  v_tot := v_tot + coalesce((select sum(coalesce((d.value->>'pts')::int, 0)) from public.docs x, jsonb_each(x.data->p_nino) d
                             where x.comunidad_id = p_comunidad and x.col = 'desafios' and jsonb_typeof(x.data->p_nino) = 'object'), 0);
  v_tot := v_tot + coalesce((select sum(pts) from public.album_actividad where comunidad_id = p_comunidad and nino_id = p_nino), 0);
  return floor(v_tot)::int;
end $$;

create or replace function public.precio_sobre(p_comunidad uuid)
returns int language sql stable security definer set search_path = public as $$
  select greatest(1, coalesce((select nullif(data->>'precioSobre','')::int from public.docs where comunidad_id = p_comunidad and col = 'config' and id = 'general'), 50))
$$;

-- Estado de cada niño: puntos, saldo, sobres y láminas
create or replace function public.album_estado(p_comunidad uuid)
returns table (nino_id text, pts_ganados int, pts_gastados int, saldo int, sobres int, abiertos int, pegadas int, repetidas int, precio int)
language sql stable security definer set search_path = public as $$
  select n.id, g.pts, coalesce(s.puntos_gastados, 0), g.pts - coalesce(s.puntos_gastados, 0),
         coalesce(s.extra, 0) + coalesce(s.comprados, 0) - coalesce(s.abiertos, 0), coalesce(s.abiertos, 0),
         (select count(*) from public.album_laminas l where l.comunidad_id = p_comunidad and l.nino_id = n.id and l.cantidad > 0)::int,
         coalesce((select sum(l.cantidad - 1) from public.album_laminas l where l.comunidad_id = p_comunidad and l.nino_id = n.id and l.cantidad > 1), 0)::int,
         public.precio_sobre(p_comunidad)
  from public.docs n
  cross join lateral (select public.album_pts(p_comunidad, n.id) as pts) g
  left join public.album_sobres s on s.comunidad_id = p_comunidad and s.nino_id = n.id
  where n.comunidad_id = p_comunidad and n.col = 'ninos' and public.mi_rol(p_comunidad) is not null
$$;

-- Cambiar puntos por sobres (cuando el niño quiera)
create or replace function public.canjear_sobres(p_comunidad uuid, p_nino text, p_cantidad int default 1)
returns int language plpgsql security definer set search_path = public as $$
declare v_precio int := public.precio_sobre(p_comunidad); v_gast int;
begin
  if not public.nino_mio(p_comunidad, p_nino) then raise exception 'Este niño no está vinculado a tu familia'; end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 10 then raise exception 'Cantidad inválida'; end if;
  insert into public.album_sobres (comunidad_id, nino_id) values (p_comunidad, p_nino) on conflict do nothing;
  select puntos_gastados into v_gast from public.album_sobres where comunidad_id = p_comunidad and nino_id = p_nino for update;
  if public.album_pts(p_comunidad, p_nino) - v_gast < v_precio * p_cantidad then
    raise exception 'Te faltan puntos: cada sobre cuesta % puntos', v_precio; end if;
  update public.album_sobres set comprados = comprados + p_cantidad, puntos_gastados = puntos_gastados + v_precio * p_cantidad
   where comunidad_id = p_comunidad and nino_id = p_nino;
  return p_cantidad;
end $$;

-- Abrir un sobre: 5 láminas, al menos 1 nueva mientras falten
create or replace function public.abrir_sobre(p_comunidad uuid, p_nino text)
returns table (num int, es_nueva boolean)
language plpgsql security definer set search_path = public as $$
declare
  r record; s public.album_sobres%rowtype; v_total int; v_por int; v_sacadas int[] := '{}'; v_n int; i int; v_falta int[];
begin
  if not public.nino_mio(p_comunidad, p_nino) then raise exception 'Este niño no está vinculado a tu familia'; end if;
  select * into r from public.album_reglas(); v_total := r.total; v_por := r.por_sobre;
  insert into public.album_sobres (comunidad_id, nino_id) values (p_comunidad, p_nino) on conflict do nothing;
  select * into s from public.album_sobres where comunidad_id = p_comunidad and nino_id = p_nino for update;
  if s.abiertos >= s.extra + s.comprados then raise exception 'No tienes sobres por abrir'; end if;

  select array_agg(g) into v_falta from generate_series(1, v_total) g
   where not exists (select 1 from public.album_laminas l where l.comunidad_id = p_comunidad and l.nino_id = p_nino and l.lamina = g and l.cantidad > 0);
  for i in 1..v_por loop
    if i = 1 and coalesce(array_length(v_falta, 1), 0) > 0 then
      v_n := v_falta[1 + floor(random() * array_length(v_falta, 1))::int];
    else
      v_n := 1 + floor(random() * v_total)::int;
    end if;
    v_sacadas := v_sacadas || v_n;
  end loop;

  for i in 1..v_por loop
    num := v_sacadas[i];
    es_nueva := not exists (select 1 from public.album_laminas l where l.comunidad_id = p_comunidad and l.nino_id = p_nino and l.lamina = num and l.cantidad > 0);
    insert into public.album_laminas (comunidad_id, nino_id, lamina, cantidad) values (p_comunidad, p_nino, num, 1)
      on conflict (comunidad_id, nino_id, lamina) do update set cantidad = public.album_laminas.cantidad + 1;
    return next;
  end loop;
  update public.album_sobres set abiertos = abiertos + 1 where comunidad_id = p_comunidad and nino_id = p_nino;
end $$;

-- Sobres de regalo (solo maestros y administradores)
create or replace function public.regalar_sobre(p_comunidad uuid, p_nino text, p_cantidad int default 1, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_equipo(p_comunidad) then raise exception 'Solo el equipo puede regalar sobres'; end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 10 then raise exception 'Cantidad inválida'; end if;
  if not exists (select 1 from public.docs where comunidad_id = p_comunidad and col = 'ninos' and id = p_nino) then raise exception 'Niño no encontrado'; end if;
  insert into public.album_sobres (comunidad_id, nino_id, extra) values (p_comunidad, p_nino, p_cantidad)
    on conflict (comunidad_id, nino_id) do update set extra = public.album_sobres.extra + p_cantidad;
  insert into public.album_regalos (comunidad_id, nino_id, cantidad, motivo, por)
    values (p_comunidad, p_nino, p_cantidad, nullif(left(btrim(coalesce(p_motivo, '')), 120), ''), auth.uid());
end $$;

-- Puntos por actividades de la app (una vez por actividad, máximo 40 puntos al día)
create or replace function public.sumar_actividad(p_comunidad uuid, p_nino text, p_tipo text, p_ref text)
returns int language plpgsql security definer set search_path = public as $$
declare v_pts int; v_hoy int;
begin
  if not public.nino_mio(p_comunidad, p_nino) then return 0; end if;
  v_pts := case p_tipo when 'cuentos' then 5 when 'plan' then 5 when 'versos' then 5 when 'quiz' then 5
                       when 'mats' then 3 when 'museo' then 3 when 'biblicos' then 3 when 'leidos' then 2 else 0 end;
  if v_pts = 0 or p_ref is null or char_length(p_ref) > 120 then return 0; end if;
  select coalesce(sum(pts), 0) into v_hoy from public.album_actividad where comunidad_id = p_comunidad and nino_id = p_nino and fecha = current_date;
  if v_hoy >= 40 then return 0; end if;
  v_pts := least(v_pts, 40 - v_hoy);
  insert into public.album_actividad (comunidad_id, nino_id, tipo, ref, pts) values (p_comunidad, p_nino, p_tipo, p_ref, v_pts)
    on conflict do nothing;
  if not found then return 0; end if;
  return v_pts;
end $$;

-- Intercambios: solo láminas repetidas
create or replace function public.ofrecer_intercambio(p_comunidad uuid, p_de text, p_para text, p_ofrece int, p_pide int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.nino_mio(p_comunidad, p_de) then raise exception 'Este niño no está vinculado a tu familia'; end if;
  if p_de = p_para then raise exception 'Elige a otro niño'; end if;
  if p_ofrece = p_pide then raise exception 'Elige láminas distintas'; end if;
  if not exists (select 1 from public.docs where comunidad_id = p_comunidad and col = 'ninos' and id = p_para) then raise exception 'Ese niño no está en tu congregación'; end if;
  if coalesce((select cantidad from public.album_laminas where comunidad_id = p_comunidad and nino_id = p_de and lamina = p_ofrece), 0) < 2 then
    raise exception 'Solo puedes ofrecer láminas repetidas'; end if;
  if coalesce((select cantidad from public.album_laminas where comunidad_id = p_comunidad and nino_id = p_para and lamina = p_pide), 0) < 2 then
    raise exception 'Esa lámina no está repetida en su álbum'; end if;
  if (select count(*) from public.album_intercambios where comunidad_id = p_comunidad and de_nino = p_de and estado = 'pendiente') >= 5 then
    raise exception 'Ya tienes 5 ofertas esperando respuesta'; end if;
  insert into public.album_intercambios (comunidad_id, de_nino, para_nino, ofrece, pide)
    values (p_comunidad, p_de, p_para, p_ofrece, p_pide) returning id into v_id;
  return v_id;
end $$;

create or replace function public.responder_intercambio(p_id uuid, p_acepta boolean)
returns text language plpgsql security definer set search_path = public as $$
declare t public.album_intercambios%rowtype;
begin
  select * into t from public.album_intercambios where id = p_id for update;
  if not found or t.estado <> 'pendiente' then raise exception 'Esa oferta ya no está disponible'; end if;
  if not public.nino_mio(t.comunidad_id, t.para_nino) then raise exception 'Esta oferta no es para tu familia'; end if;
  if not p_acepta then
    update public.album_intercambios set estado = 'rechazado', resuelto = now() where id = p_id; return 'rechazado';
  end if;
  perform 1 from public.album_laminas where comunidad_id = t.comunidad_id and nino_id in (t.de_nino, t.para_nino) for update;
  if coalesce((select cantidad from public.album_laminas where comunidad_id = t.comunidad_id and nino_id = t.de_nino and lamina = t.ofrece), 0) < 2
     or coalesce((select cantidad from public.album_laminas where comunidad_id = t.comunidad_id and nino_id = t.para_nino and lamina = t.pide), 0) < 2 then
    update public.album_intercambios set estado = 'cancelado', resuelto = now() where id = p_id;
    raise exception 'Una de las láminas ya no está repetida; la oferta se canceló';
  end if;
  update public.album_laminas set cantidad = cantidad - 1 where comunidad_id = t.comunidad_id and nino_id = t.de_nino and lamina = t.ofrece;
  update public.album_laminas set cantidad = cantidad - 1 where comunidad_id = t.comunidad_id and nino_id = t.para_nino and lamina = t.pide;
  insert into public.album_laminas (comunidad_id, nino_id, lamina, cantidad) values (t.comunidad_id, t.de_nino, t.pide, 1)
    on conflict (comunidad_id, nino_id, lamina) do update set cantidad = public.album_laminas.cantidad + 1;
  insert into public.album_laminas (comunidad_id, nino_id, lamina, cantidad) values (t.comunidad_id, t.para_nino, t.ofrece, 1)
    on conflict (comunidad_id, nino_id, lamina) do update set cantidad = public.album_laminas.cantidad + 1;
  update public.album_intercambios set estado = 'aceptado', resuelto = now() where id = p_id;
  insert into public.album_chat (comunidad_id, autor, texto, tipo)
    values (t.comunidad_id, 'Álbum', public.nombre_nino(t.comunidad_id, t.de_nino) || ' y ' || public.nombre_nino(t.comunidad_id, t.para_nino)
            || ' cambiaron la lámina ' || t.ofrece || ' por la ' || t.pide || ' 🤝', 'sistema');
  return 'aceptado';
end $$;

create or replace function public.cancelar_intercambio(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.album_intercambios%rowtype;
begin
  select * into t from public.album_intercambios where id = p_id for update;
  if not found or t.estado <> 'pendiente' then return; end if;
  if not public.nino_mio(t.comunidad_id, t.de_nino) then raise exception 'Esta oferta no es tuya'; end if;
  update public.album_intercambios set estado = 'cancelado', resuelto = now() where id = p_id;
end $$;

-- Chat del patio de intercambio: solo texto corto, sin enlaces, correos ni teléfonos
create or replace function public.chat_album(p_comunidad uuid, p_nino text, p_texto text)
returns void language plpgsql security definer set search_path = public as $$
declare v text := btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g')); v_aut text;
begin
  if not public.nino_mio(p_comunidad, p_nino) then raise exception 'Este niño no está vinculado a tu familia'; end if;
  if coalesce((select data->>'chatAlbum' from public.docs where comunidad_id = p_comunidad and col = 'config' and id = 'general'), 'si') = 'no'
     and not public.es_equipo(p_comunidad) then raise exception 'El patio de intercambio está cerrado por ahora'; end if;
  if char_length(v) < 1 or char_length(v) > 200 then raise exception 'Escribe un mensaje corto (máximo 200 letras)'; end if;
  if v ~* '(https?://|www\.|\.com\M|\.cl\M|@|wa\.me|\mwhats|\minsta(gram)?\M|\mtiktok|\mface(book)?\M|\mdiscord|\mtelegram)' or v ~ '\d[\d\s.-]{6,}\d' then
    raise exception 'Por seguridad no se pueden enviar enlaces, correos, redes ni teléfonos'; end if;
  if v ~* '\m(tonto|tonta|idiota|estupid[oa]|weon|weón|hue[vb]on|mierda|ctm|conchetumare|puta|puto|maldit[oa]|imbecil|imbécil)\M' then
    raise exception 'Usemos palabras amables 💛'; end if;
  if exists (select 1 from public.album_chat where comunidad_id = p_comunidad and nino_id = p_nino and creado > now() - interval '4 seconds') then
    raise exception 'Espera un momentito antes de enviar otro mensaje'; end if;
  v_aut := public.nombre_nino(p_comunidad, p_nino);
  insert into public.album_chat (comunidad_id, nino_id, autor, texto) values (p_comunidad, p_nino, coalesce(v_aut, 'Alguien'), v);
end $$;

create or replace function public.moderar_chat_album(p_id uuid, p_ocultar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  select comunidad_id into c from public.album_chat where id = p_id;
  if c is null then return; end if;
  if public.es_equipo(c) then
    update public.album_chat set estado = case when p_ocultar then 'oculto' else 'publicado' end where id = p_id;
  elsif public.mi_rol(c) is not null and p_ocultar then
    -- una familia puede reportar: con 2 reportes se oculta hasta que el maestro lo revise
    update public.album_chat set reportes = reportes + 1, estado = case when reportes + 1 >= 2 then 'oculto' else estado end where id = p_id;
  end if;
end $$;

revoke all on function public.nino_mio(uuid, text), public.nombre_nino(uuid, text), public.album_pts(uuid, text), public.precio_sobre(uuid) from public, anon;
revoke all on function public.album_estado(uuid), public.abrir_sobre(uuid, text), public.regalar_sobre(uuid, text, int, text), public.canjear_sobres(uuid, text, int), public.sumar_actividad(uuid, text, text, text),
  public.ofrecer_intercambio(uuid, text, text, int, int), public.responder_intercambio(uuid, boolean), public.cancelar_intercambio(uuid),
  public.chat_album(uuid, text, text), public.moderar_chat_album(uuid, boolean) from public, anon;
grant execute on function public.album_estado(uuid), public.abrir_sobre(uuid, text), public.regalar_sobre(uuid, text, int, text), public.canjear_sobres(uuid, text, int), public.sumar_actividad(uuid, text, text, text),
  public.ofrecer_intercambio(uuid, text, text, int, int), public.responder_intercambio(uuid, boolean), public.cancelar_intercambio(uuid),
  public.chat_album(uuid, text, text), public.moderar_chat_album(uuid, boolean), public.album_reglas() to authenticated;

select 'Listo: álbum bíblico instalado' as resultado;
