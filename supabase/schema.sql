-- =====================================================================
-- Eterno Pacto Kids · Base de datos (Supabase)
-- Pegar COMPLETO en Supabase → SQL Editor → New query → Run.
-- Se puede ejecutar más de una vez sin problemas.
-- =====================================================================

-- ---------- Tablas ----------
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default '',
  email text,
  acepto_terminos timestamptz,
  creado timestamptz not null default now()
);

create table if not exists public.comunidades (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 2 and 80),
  codigo text not null unique,
  creada_por uuid references auth.users(id) on delete set null,
  creado timestamptz not null default now()
);

create table if not exists public.miembros (
  comunidad_id uuid not null references public.comunidades(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rol text not null default 'familia' check (rol in ('admin','maestro','familia')),
  creado timestamptz not null default now(),
  primary key (comunidad_id, user_id)
);

-- Contenido de cada congregación (clases, cuentos, niños, puntos, muro, etc.)
create table if not exists public.docs (
  comunidad_id uuid not null references public.comunidades(id) on delete cascade,
  col text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  actualizado timestamptz not null default now(),
  actualizado_por uuid default auth.uid(),
  primary key (comunidad_id, col, id)
);
create index if not exists docs_col_idx on public.docs (comunidad_id, col);

-- Perfiles familiares, avance de lectura e insignias (uno por cuenta)
create table if not exists public.familias (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  actualizado timestamptz not null default now()
);

-- ---------- Funciones de apoyo ----------
create or replace function public.mi_rol(c uuid)
returns text language sql stable security definer set search_path = public as $$
  select rol from public.miembros where comunidad_id = c and user_id = auth.uid()
$$;

create or replace function public.es_equipo(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol(c) in ('admin','maestro'), false)
$$;

-- Perfil automático al registrarse
create or replace function public.nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre, email, acepto_terminos)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'nombre', ''),
          new.email,
          case when (new.raw_user_meta_data->>'acepto') = 'si' then now() end)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.nuevo_usuario();

-- Crear congregación: quien la crea queda como administrador
create or replace function public.crear_comunidad(p_nombre text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_codigo text;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if (select count(*) from public.comunidades where creada_por = auth.uid()) >= 5 then
    raise exception 'Ya creaste el máximo de congregaciones';
  end if;
  loop
    v_codigo := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when char_length(v_codigo) = 6 and not exists (select 1 from public.comunidades where codigo = v_codigo);
  end loop;
  insert into public.comunidades (nombre, codigo, creada_por)
    values (trim(p_nombre), v_codigo, auth.uid()) returning id into v_id;
  insert into public.miembros (comunidad_id, user_id, rol) values (v_id, auth.uid(), 'admin');
  -- Contenido inicial: museo de parábolas
  insert into public.docs (comunidad_id, col, id, data)
    select v_id, 'parabolas', e->>'id', e - 'id' from jsonb_array_elements($j$[{"cita": "Lucas 10:25-37", "ensenanza": "Amar al prójimo es ayudar a quien lo necesita, aunque sea diferente a nosotros.", "icono": "camino", "orden": 5, "pregunta": "¿A quién podemos ayudar esta semana en el colegio o en la casa?", "resumen": "Un hombre fue asaltado y quedó herido en el camino. Dos personas pasaron sin ayudarlo, pero un samaritano se detuvo, curó sus heridas y pagó para que lo cuidaran.", "titulo": "El buen samaritano", "id": "buen-samaritano"}, {"cita": "Mateo 25:1-13", "ensenanza": "Debemos estar siempre preparados y atentos a Jesús.", "icono": "lampara", "orden": 9, "pregunta": "¿Cómo podemos estar listos y atentos a Dios cada día?", "resumen": "Diez jóvenes esperaban al novio con sus lámparas. Cinco llevaron aceite extra y estaban listas cuando él llegó; las otras cinco no estaban preparadas.", "titulo": "Las diez jóvenes y sus lámparas", "id": "diez-virgenes"}, {"cita": "Mateo 7:24-27", "ensenanza": "Escuchar a Jesús y obedecer lo que dice nos da un fundamento firme para la vida.", "icono": "casa", "orden": 6, "pregunta": "¿Qué enseñanza de Jesús quieres poner en práctica esta semana?", "resumen": "Un hombre prudente construyó su casa sobre la roca y otro, sobre la arena. Vino la lluvia y el viento: la casa sobre la roca quedó firme y la otra se cayó.", "titulo": "Las dos casas", "id": "dos-casas"}, {"cita": "Lucas 15:11-32", "ensenanza": "Dios es un Padre que perdona y nos recibe con los brazos abiertos cuando volvemos a Él.", "icono": "corazon", "orden": 4, "pregunta": "¿Hay alguien a quien necesitamos perdonar o pedir perdón esta semana?", "resumen": "Un hijo pidió su herencia, se fue lejos y la gastó toda. Arrepentido, volvió a casa pensando en pedir trabajo, pero su padre corrió a abrazarlo y preparó una gran fiesta.", "titulo": "El hijo pródigo", "id": "hijo-prodigo"}, {"cita": "Lucas 15:8-10", "ensenanza": "Dios valora a cada persona y en el cielo hay alegría cuando alguien se arrepiente.", "icono": "moneda", "orden": 3, "pregunta": "¿Alguna vez buscaste algo muy valioso? ¿Qué sentiste al encontrarlo?", "resumen": "Una mujer perdió una de sus diez monedas. Encendió una lámpara, barrió toda la casa y buscó con cuidado hasta encontrarla. Luego invitó a sus vecinas a celebrar.", "titulo": "La moneda perdida", "id": "moneda-perdida"}, {"cita": "Lucas 15:3-7", "ensenanza": "Para Jesús cada uno de nosotros es importante. Él nos busca con amor y se alegra cuando volvemos a Él.", "icono": "oveja", "orden": 2, "pregunta": "¿Cómo te sientes al saber que Jesús te buscaría a ti?", "resumen": "Un pastor tenía cien ovejas y una se perdió. Dejó a las noventa y nueve para buscarla, y cuando la encontró la cargó en sus hombros feliz e hizo fiesta con sus amigos.", "titulo": "La oveja perdida", "id": "oveja-perdida"}, {"cita": "Mateo 13:45-46", "ensenanza": "Conocer a Jesús y su Reino vale más que cualquier tesoro.", "icono": "perla", "orden": 8, "pregunta": "¿Qué es lo más valioso para ti? ¿Por qué Jesús vale todavía más?", "resumen": "Un comerciante buscaba perlas finas. Cuando encontró una de gran valor, vendió todo lo que tenía para comprarla.", "titulo": "La perla de gran precio", "id": "perla"}, {"cita": "Mateo 13:1-23", "ensenanza": "La Palabra de Dios es la semilla. Cuando la escuchamos con un corazón dispuesto, crece y da fruto en nuestra vida.", "icono": "semilla", "orden": 1, "pregunta": "¿Qué podemos hacer esta semana para que nuestro corazón sea buena tierra?", "resumen": "Un sembrador lanzó semillas. Algunas cayeron en el camino y los pájaros se las comieron, otras en piedras o entre espinos y no crecieron. Las que cayeron en buena tierra dieron mucho fruto.", "titulo": "El sembrador", "id": "sembrador"}, {"cita": "Mateo 13:31-32", "ensenanza": "El Reino de Dios empieza pequeño y crece mucho. Nuestra fe también puede crecer cada día.", "icono": "arbol", "orden": 7, "pregunta": "¿Qué cosa pequeña puedes hacer hoy para mostrar el amor de Dios?", "resumen": "La semilla de mostaza es una de las más pequeñas, pero cuando crece se convierte en un árbol grande donde los pájaros hacen sus nidos.", "titulo": "La semilla de mostaza", "id": "semilla-mostaza"}, {"cita": "Mateo 25:14-30", "ensenanza": "Dios nos da dones y habilidades para usarlos y bendecir a otros.", "icono": "talentos", "orden": 10, "pregunta": "¿Qué talento te regaló Dios y cómo puedes usarlo para ayudar?", "resumen": "Un señor dejó dinero a sus siervos antes de viajar. Dos lo hicieron crecer y uno lo escondió bajo tierra por miedo. Al volver, el señor felicitó a los que trabajaron con lo que recibieron.", "titulo": "Los talentos", "id": "talentos"}]$j$::jsonb) e;
  -- Carta de compromiso del 4 de octubre (solo Eterno Pacto)
  if p_nombre ilike '%eterno pacto%' then
    insert into public.docs (comunidad_id, col, id, data)
      select v_id, 'compromisos', e->>'id', e - 'id' from jsonb_array_elements($j$[{"cierre": "También les pedimos que continúen orando por nosotros. Necesitamos de su guía, su ejemplo y su apoyo para seguir creciendo en la fe y llegar a ser hombres y mujeres que honren a Dios con sus vidas.\nDeseamos que, juntos, niños y adultos, sigamos construyendo una iglesia fuerte, unida y llena del amor de Cristo.\nCon gratitud y alegría, ponemos este compromiso en las manos de nuestro Señor Jesús.", "compromisos": "Escuchar y aprender la Palabra de Dios con alegría y respeto.\nOrar cada día y confiar en Jesús en todo momento.\nTratar a los demás con amor, bondad y respeto.\nSer obedientes a nuestros padres, maestros y líderes.\nAyudar a quienes nos necesiten y compartir el amor de Cristo con otros niños.\nCuidar la iglesia y participar con entusiasmo en las actividades que Dios nos permita realizar.\nSeguir creciendo para ser discípulos de Jesús que reflejen Su luz en la escuela, en nuestros hogares y en la comunidad.", "fecha": "2026-10-04", "firma": "Con amor, los niños de Eterno Pacto KIDS", "firmantes": "", "intro": "Con mucho cariño queremos dirigirles estas palabras como niños que formamos parte de esta hermosa familia de fe.\nAntes que todo, les damos gracias por recibirnos, enseñarnos y acompañarnos en nuestro crecimiento espiritual. Gracias por sus oraciones, sus consejos, su ejemplo y por hacernos sentir amados y valorados dentro de la iglesia.\nHoy queremos hacer un compromiso delante de Dios y de ustedes. Nos comprometemos a:", "saludo": "Querida Familia:", "titulo": "Carta de Compromiso de los Niños a la Congregación", "versiculo": "\"Ninguno tenga en poco tu juventud, sino sé ejemplo de los creyentes.\"", "versiculoCita": "1 Timoteo 4:12", "id": "carta-2026-10-04"}]$j$::jsonb) e;
  end if;
  return v_id;
end $$;

-- Unirse con el código de invitación (entra como familia)
create or replace function public.unirse_comunidad(p_codigo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  select id into v_id from public.comunidades where codigo = upper(trim(p_codigo));
  if v_id is null then raise exception 'Código no encontrado'; end if;
  insert into public.miembros (comunidad_id, user_id, rol) values (v_id, auth.uid(), 'familia')
    on conflict do nothing;
  return v_id;
end $$;

-- Cambiar el rol de un miembro (solo administradores)
create or replace function public.cambiar_rol(p_comunidad uuid, p_user uuid, p_rol text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.mi_rol(p_comunidad) is distinct from 'admin' then raise exception 'Solo un administrador puede cambiar roles'; end if;
  if p_rol not in ('admin','maestro','familia') then raise exception 'Rol no válido'; end if;
  if p_rol <> 'admin' and (select rol from public.miembros where comunidad_id = p_comunidad and user_id = p_user) = 'admin'
     and (select count(*) from public.miembros where comunidad_id = p_comunidad and rol = 'admin') <= 1 then
    raise exception 'La congregación debe tener al menos un administrador';
  end if;
  update public.miembros set rol = p_rol where comunidad_id = p_comunidad and user_id = p_user;
end $$;

-- Quitar a un miembro (administrador) o salir uno mismo
create or replace function public.quitar_miembro(p_comunidad uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user <> auth.uid() and public.mi_rol(p_comunidad) is distinct from 'admin' then
    raise exception 'Solo un administrador puede quitar miembros';
  end if;
  if (select rol from public.miembros where comunidad_id = p_comunidad and user_id = p_user) = 'admin'
     and (select count(*) from public.miembros where comunidad_id = p_comunidad and rol = 'admin') <= 1 then
    raise exception 'La congregación debe tener al menos un administrador';
  end if;
  delete from public.miembros where comunidad_id = p_comunidad and user_id = p_user;
end $$;

-- Lista de miembros con nombre y correo (solo administradores)
create or replace function public.lista_miembros(p_comunidad uuid)
returns table (user_id uuid, nombre text, email text, rol text, creado timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.nombre, p.email, m.rol, m.creado
  from public.miembros m left join public.perfiles p on p.id = m.user_id
  where m.comunidad_id = p_comunidad and public.mi_rol(p_comunidad) = 'admin'
  order by m.rol, p.nombre
$$;

-- ---------- Seguridad por filas (RLS) ----------
alter table public.perfiles   enable row level security;
alter table public.comunidades enable row level security;
alter table public.miembros   enable row level security;
alter table public.docs       enable row level security;
alter table public.familias   enable row level security;

drop policy if exists "perfil propio" on public.perfiles;
create policy "perfil propio" on public.perfiles for select using (id = auth.uid());
drop policy if exists "editar perfil propio" on public.perfiles;
create policy "editar perfil propio" on public.perfiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "ver mis comunidades" on public.comunidades;
create policy "ver mis comunidades" on public.comunidades for select using (public.mi_rol(id) is not null);
drop policy if exists "admin edita comunidad" on public.comunidades;
create policy "admin edita comunidad" on public.comunidades for update using (public.mi_rol(id) = 'admin');

drop policy if exists "ver mi membresia" on public.miembros;
create policy "ver mi membresia" on public.miembros for select using (user_id = auth.uid() or public.mi_rol(comunidad_id) = 'admin');

-- Contenido: los miembros leen; el libro de clases y el material de profes solo el equipo
drop policy if exists "leer contenido" on public.docs;
create policy "leer contenido" on public.docs for select using (
  public.mi_rol(comunidad_id) is not null
  and (col not in ('libro','matprofes') or public.es_equipo(comunidad_id))
);
drop policy if exists "equipo crea" on public.docs;
create policy "equipo crea" on public.docs for insert with check (public.es_equipo(comunidad_id));
drop policy if exists "equipo edita" on public.docs;
create policy "equipo edita" on public.docs for update using (public.es_equipo(comunidad_id)) with check (public.es_equipo(comunidad_id));
drop policy if exists "equipo borra" on public.docs;
create policy "equipo borra" on public.docs for delete using (public.es_equipo(comunidad_id));

drop policy if exists "familia propia" on public.familias;
create policy "familia propia" on public.familias for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Permisos de las tablas (Supabase ya los da; se dejan explícitos)
grant select, update on public.perfiles to authenticated;
grant select, update on public.comunidades to authenticated;
grant select on public.miembros to authenticated;
grant select, insert, update, delete on public.docs to authenticated;
grant select, insert, update, delete on public.familias to authenticated;

-- Permisos de las funciones
revoke all on function public.crear_comunidad(text) from public, anon;
revoke all on function public.unirse_comunidad(text) from public, anon;
revoke all on function public.cambiar_rol(uuid, uuid, text) from public, anon;
revoke all on function public.quitar_miembro(uuid, uuid) from public, anon;
revoke all on function public.lista_miembros(uuid) from public, anon;
grant execute on function public.crear_comunidad(text) to authenticated;
grant execute on function public.unirse_comunidad(text) to authenticated;
grant execute on function public.cambiar_rol(uuid, uuid, text) to authenticated;
grant execute on function public.quitar_miembro(uuid, uuid) to authenticated;
grant execute on function public.lista_miembros(uuid) to authenticated;

-- Cambios en vivo (que todos vean al instante lo que publica el maestro)
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;

-- ---------- Archivos (cuentos, materiales, fotos) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('archivos', 'archivos', true, 26214400,
        array['application/pdf','image/png','image/jpeg','image/gif','image/webp','video/mp4','video/webm','text/plain','text/csv'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Solo maestros y administradores suben o borran, y solo dentro de la carpeta de su congregación
drop policy if exists "equipo sube archivos" on storage.objects;
create policy "equipo sube archivos" on storage.objects for insert to authenticated
  with check (bucket_id = 'archivos' and public.es_equipo(((storage.foldername(name))[1])::uuid));
drop policy if exists "equipo borra archivos" on storage.objects;
create policy "equipo borra archivos" on storage.objects for delete to authenticated
  using (bucket_id = 'archivos' and public.es_equipo(((storage.foldername(name))[1])::uuid));
drop policy if exists "equipo lista archivos" on storage.objects;
create policy "equipo lista archivos" on storage.objects for select to authenticated
  using (bucket_id = 'archivos' and public.es_equipo(((storage.foldername(name))[1])::uuid));
