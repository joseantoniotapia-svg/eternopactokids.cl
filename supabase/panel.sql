-- =====================================================================
-- Eterno Pacto Kids · Panel de Control (súper administrador)
-- Se ejecuta DESPUÉS de schema.sql. Se puede ejecutar más de una vez.
-- =====================================================================

-- ---------- Súper administradores ----------
create table if not exists public.superadmins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  creado timestamptz not null default now()
);
alter table public.superadmins enable row level security;

create or replace function public.es_super()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.superadmins where user_id = auth.uid())
$$;

create or replace function public.soy_super()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_super()
$$;

-- ---------- Ubicación de congregaciones y suspensión de usuarios ----------
alter table public.comunidades add column if not exists ciudad text;
alter table public.comunidades add column if not exists region text;
alter table public.comunidades add column if not exists pais text default 'Chile';
alter table public.perfiles add column if not exists suspendido boolean not null default false;

-- Biblioteca central: una "congregación" especial que todos pueden leer
insert into public.comunidades (id, nombre, codigo, pais)
values ('00000000-0000-0000-0000-000000000001', 'Biblioteca central Eterno Pacto Kids', 'BIBLIOTECA-CENTRAL', null)
on conflict (id) do nothing;

-- Parábolas de la biblioteca central (plantilla del museo para cada congregación nueva)
insert into public.docs (comunidad_id, col, id, data)
  select '00000000-0000-0000-0000-000000000001'::uuid, 'parabolas', e->>'id', e - 'id'
  from jsonb_array_elements($j$[{"cita": "Lucas 10:25-37", "ensenanza": "Amar al prójimo es ayudar a quien lo necesita, aunque sea diferente a nosotros.", "icono": "camino", "orden": 5, "pregunta": "¿A quién podemos ayudar esta semana en el colegio o en la casa?", "resumen": "Un hombre fue asaltado y quedó herido en el camino. Dos personas pasaron sin ayudarlo, pero un samaritano se detuvo, curó sus heridas y pagó para que lo cuidaran.", "titulo": "El buen samaritano", "id": "buen-samaritano"}, {"cita": "Mateo 25:1-13", "ensenanza": "Debemos estar siempre preparados y atentos a Jesús.", "icono": "lampara", "orden": 9, "pregunta": "¿Cómo podemos estar listos y atentos a Dios cada día?", "resumen": "Diez jóvenes esperaban al novio con sus lámparas. Cinco llevaron aceite extra y estaban listas cuando él llegó; las otras cinco no estaban preparadas.", "titulo": "Las diez jóvenes y sus lámparas", "id": "diez-virgenes"}, {"cita": "Mateo 7:24-27", "ensenanza": "Escuchar a Jesús y obedecer lo que dice nos da un fundamento firme para la vida.", "icono": "casa", "orden": 6, "pregunta": "¿Qué enseñanza de Jesús quieres poner en práctica esta semana?", "resumen": "Un hombre prudente construyó su casa sobre la roca y otro, sobre la arena. Vino la lluvia y el viento: la casa sobre la roca quedó firme y la otra se cayó.", "titulo": "Las dos casas", "id": "dos-casas"}, {"cita": "Lucas 15:11-32", "ensenanza": "Dios es un Padre que perdona y nos recibe con los brazos abiertos cuando volvemos a Él.", "icono": "corazon", "orden": 4, "pregunta": "¿Hay alguien a quien necesitamos perdonar o pedir perdón esta semana?", "resumen": "Un hijo pidió su herencia, se fue lejos y la gastó toda. Arrepentido, volvió a casa pensando en pedir trabajo, pero su padre corrió a abrazarlo y preparó una gran fiesta.", "titulo": "El hijo pródigo", "id": "hijo-prodigo"}, {"cita": "Lucas 15:8-10", "ensenanza": "Dios valora a cada persona y en el cielo hay alegría cuando alguien se arrepiente.", "icono": "moneda", "orden": 3, "pregunta": "¿Alguna vez buscaste algo muy valioso? ¿Qué sentiste al encontrarlo?", "resumen": "Una mujer perdió una de sus diez monedas. Encendió una lámpara, barrió toda la casa y buscó con cuidado hasta encontrarla. Luego invitó a sus vecinas a celebrar.", "titulo": "La moneda perdida", "id": "moneda-perdida"}, {"cita": "Lucas 15:3-7", "ensenanza": "Para Jesús cada uno de nosotros es importante. Él nos busca con amor y se alegra cuando volvemos a Él.", "icono": "oveja", "orden": 2, "pregunta": "¿Cómo te sientes al saber que Jesús te buscaría a ti?", "resumen": "Un pastor tenía cien ovejas y una se perdió. Dejó a las noventa y nueve para buscarla, y cuando la encontró la cargó en sus hombros feliz e hizo fiesta con sus amigos.", "titulo": "La oveja perdida", "id": "oveja-perdida"}, {"cita": "Mateo 13:45-46", "ensenanza": "Conocer a Jesús y su Reino vale más que cualquier tesoro.", "icono": "perla", "orden": 8, "pregunta": "¿Qué es lo más valioso para ti? ¿Por qué Jesús vale todavía más?", "resumen": "Un comerciante buscaba perlas finas. Cuando encontró una de gran valor, vendió todo lo que tenía para comprarla.", "titulo": "La perla de gran precio", "id": "perla"}, {"cita": "Mateo 13:1-23", "ensenanza": "La Palabra de Dios es la semilla. Cuando la escuchamos con un corazón dispuesto, crece y da fruto en nuestra vida.", "icono": "semilla", "orden": 1, "pregunta": "¿Qué podemos hacer esta semana para que nuestro corazón sea buena tierra?", "resumen": "Un sembrador lanzó semillas. Algunas cayeron en el camino y los pájaros se las comieron, otras en piedras o entre espinos y no crecieron. Las que cayeron en buena tierra dieron mucho fruto.", "titulo": "El sembrador", "id": "sembrador"}, {"cita": "Mateo 13:31-32", "ensenanza": "El Reino de Dios empieza pequeño y crece mucho. Nuestra fe también puede crecer cada día.", "icono": "arbol", "orden": 7, "pregunta": "¿Qué cosa pequeña puedes hacer hoy para mostrar el amor de Dios?", "resumen": "La semilla de mostaza es una de las más pequeñas, pero cuando crece se convierte en un árbol grande donde los pájaros hacen sus nidos.", "titulo": "La semilla de mostaza", "id": "semilla-mostaza"}, {"cita": "Mateo 25:14-30", "ensenanza": "Dios nos da dones y habilidades para usarlos y bendecir a otros.", "icono": "talentos", "orden": 10, "pregunta": "¿Qué talento te regaló Dios y cómo puedes usarlo para ayudar?", "resumen": "Un señor dejó dinero a sus siervos antes de viajar. Dos lo hicieron crecer y uno lo escondió bajo tierra por miedo. Al volver, el señor felicitó a los que trabajaron con lo que recibieron.", "titulo": "Los talentos", "id": "talentos"}]$j$::jsonb) e
on conflict do nothing;

create or replace function public.central_id()
returns uuid language sql immutable as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;

-- El súper administrador es administrador de todas las congregaciones;
-- un usuario suspendido pierde el acceso a todas.
create or replace function public.mi_rol(c uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when public.es_super() then 'admin'
    when exists (select 1 from public.perfiles where id = auth.uid() and suspendido) then null
    else (select rol from public.miembros where comunidad_id = c and user_id = auth.uid())
  end
$$;

create or replace function public.usuario_activo()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and not exists (select 1 from public.perfiles where id = auth.uid() and suspendido)
$$;

create or replace function public.es_equipo_alguna()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_super() or exists (select 1 from public.miembros m join public.perfiles p on p.id = m.user_id
    where m.user_id = auth.uid() and m.rol in ('admin','maestro') and not p.suspendido)
$$;

-- Crear congregación con ubicación
drop function if exists public.crear_comunidad(text);
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
  return v_id;
end $$;
revoke all on function public.crear_comunidad(text, text, text, text) from public, anon;
grant execute on function public.crear_comunidad(text, text, text, text) to authenticated;

create or replace function public.unirse_comunidad(p_codigo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if exists (select 1 from public.perfiles where id = auth.uid() and suspendido) then raise exception 'Tu cuenta está suspendida'; end if;
  select id into v_id from public.comunidades where codigo = upper(trim(p_codigo)) and id <> public.central_id();
  if v_id is null then raise exception 'Código no encontrado'; end if;
  insert into public.miembros (comunidad_id, user_id, rol) values (v_id, auth.uid(), 'familia') on conflict do nothing;
  return v_id;
end $$;

-- ---------- Funciones del panel ----------
create or replace function public.super_usuarios()
returns table (user_id uuid, nombre text, email text, creado timestamptz, ultimo_ingreso timestamptz, suspendido boolean, es_super boolean, comunidades jsonb)
language sql stable security definer set search_path = public, auth as $$
  select u.id, p.nombre, u.email, u.created_at, u.last_sign_in_at, coalesce(p.suspendido, false),
         exists (select 1 from public.superadmins s where s.user_id = u.id),
         coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'rol', m.rol) order by c.nombre)
                   from public.miembros m join public.comunidades c on c.id = m.comunidad_id where m.user_id = u.id), '[]'::jsonb)
  from auth.users u left join public.perfiles p on p.id = u.id
  where public.es_super()
  order by u.created_at desc
$$;

create or replace function public.super_suspender(p_user uuid, p_valor boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_super() then raise exception 'Solo el súper administrador'; end if;
  if p_user = auth.uid() then raise exception 'No puedes suspender tu propia cuenta'; end if;
  insert into public.perfiles (id, suspendido) values (p_user, p_valor)
    on conflict (id) do update set suspendido = excluded.suspendido;
end $$;

create or replace function public.super_agregar_miembro(p_comunidad uuid, p_user uuid, p_rol text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_super() then raise exception 'Solo el súper administrador'; end if;
  if p_rol not in ('admin','maestro','familia') then raise exception 'Rol no válido'; end if;
  insert into public.miembros (comunidad_id, user_id, rol) values (p_comunidad, p_user, p_rol)
    on conflict (comunidad_id, user_id) do update set rol = excluded.rol;
end $$;

revoke all on function public.soy_super() from public, anon;
revoke all on function public.super_usuarios() from public, anon;
revoke all on function public.super_suspender(uuid, boolean) from public, anon;
revoke all on function public.super_agregar_miembro(uuid, uuid, text) from public, anon;
grant execute on function public.soy_super() to authenticated;
grant execute on function public.super_usuarios() to authenticated;
grant execute on function public.super_suspender(uuid, boolean) to authenticated;
grant execute on function public.super_agregar_miembro(uuid, uuid, text) to authenticated;

-- ---------- Permisos ----------
-- Contenido: además de lo propio, todos leen la biblioteca central (material de profes: solo equipos)
drop policy if exists "leer contenido" on public.docs;
create policy "leer contenido" on public.docs for select using (
  (public.mi_rol(comunidad_id) is not null and (col not in ('libro','matprofes') or public.es_equipo(comunidad_id)))
  or (comunidad_id = public.central_id() and public.usuario_activo() and (col <> 'matprofes' or public.es_equipo_alguna()))
);

drop policy if exists "super ve perfiles" on public.perfiles;
create policy "super ve perfiles" on public.perfiles for select using (public.es_super());
drop policy if exists "super edita perfiles" on public.perfiles;
create policy "super edita perfiles" on public.perfiles for update using (public.es_super()) with check (public.es_super());
drop policy if exists "super ve familias" on public.familias;
create policy "super ve familias" on public.familias for select using (public.es_super());
drop policy if exists "super borra comunidad" on public.comunidades;
create policy "super borra comunidad" on public.comunidades for delete using (public.es_super() and id <> public.central_id());
grant delete on public.comunidades to authenticated;

-- Archivos de la biblioteca central: cualquiera con sesión puede leerlos (el bucket ya es público)
-- y solo el súper administrador sube o borra (cubierto por es_equipo → mi_rol = admin).

select 'Listo: Panel de Control instalado' as resultado;
