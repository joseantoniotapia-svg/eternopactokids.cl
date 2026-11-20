-- ============================================================
-- Recursos Premium: dos niveles (Inicial y Premium)
-- Premium se activa por congregación (plan de la comunidad, como siempre)
-- o por familia (código Premium que entrega el súper administrador,
-- o activación directa por correo). Se puede ejecutar más de una vez.
-- ============================================================

-- 1) Dos niveles: lo que era «Avanzado» pasa a Premium
update public.docs set data = jsonb_set(data, '{plan}', '"completo"') where data->>'plan' = 'basico';
update public.comunidades set plan_id = 'completo' where plan_id = 'basico';
update public.planes set nombre = 'Premium', orden = 1, descripcion = 'Material preparado para maestros y familias (acceso con abono)' where id = 'completo';
update public.planes set nombre = 'Inicial', orden = 0, descripcion = 'Material abierto para todos' where id = 'gratis';
delete from public.planes where id = 'basico' and not exists (select 1 from public.comunidades where plan_id = 'basico');

-- 2) Premium por familia
create table if not exists public.premium_familias (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hasta date not null,
  origen text,
  actualizado timestamptz not null default now()
);
create table if not exists public.premium_codigos (
  codigo text primary key,
  dias int not null check (dias between 1 and 3660),
  nota text,
  creado timestamptz not null default now(),
  creado_por uuid,
  usado_por uuid,
  usado_en timestamptz
);
alter table public.premium_familias enable row level security;
alter table public.premium_codigos enable row level security;
drop policy if exists "premium propio" on public.premium_familias;
create policy "premium propio" on public.premium_familias for select using (user_id = auth.uid() or public.es_super());
drop policy if exists "codigos super" on public.premium_codigos;
create policy "codigos super" on public.premium_codigos for select using (public.es_super());

create or replace function public.premium_familia_activo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.premium_familias where user_id = auth.uid() and hasta >= public.hoy_cl())
$$;

create or replace function public.mi_premium()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('familia_hasta', (select hasta from public.premium_familias where user_id = auth.uid()))
$$;

-- La familia canjea su código
create or replace function public.canjear_codigo_premium(p_codigo text)
returns date language plpgsql security definer set search_path = public as $$
declare c public.premium_codigos%rowtype; v date;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  select * into c from public.premium_codigos where codigo = upper(btrim(p_codigo)) for update;
  if not found then raise exception 'Ese código no existe. Revisa que esté bien escrito'; end if;
  if c.usado_por is not null then raise exception 'Ese código ya fue usado'; end if;
  insert into public.premium_familias (user_id, hasta, origen) values (auth.uid(), public.hoy_cl() + c.dias, 'código ' || c.codigo)
    on conflict (user_id) do update set hasta = greatest(public.premium_familias.hasta, public.hoy_cl()) + c.dias, origen = 'código ' || c.codigo, actualizado = now()
    returning hasta into v;
  update public.premium_codigos set usado_por = auth.uid(), usado_en = now() where codigo = c.codigo;
  return v;
end $$;

-- El súper administrador crea códigos (30 días = mensual, 365 = anual)
create or replace function public.super_crear_codigo_premium(p_dias int, p_nota text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v text; alf text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; i int;
begin
  if not public.es_super() then raise exception 'Solo el súper administrador'; end if;
  loop
    v := 'EPK-';
    for i in 1..4 loop v := v || substr(alf, 1 + floor(random() * length(alf))::int, 1); end loop;
    v := v || '-';
    for i in 1..4 loop v := v || substr(alf, 1 + floor(random() * length(alf))::int, 1); end loop;
    exit when not exists (select 1 from public.premium_codigos where codigo = v);
  end loop;
  insert into public.premium_codigos (codigo, dias, nota, creado_por) values (v, p_dias, nullif(btrim(coalesce(p_nota, '')), ''), auth.uid());
  return v;
end $$;

-- O activa directamente a una familia por su correo
create or replace function public.super_premium_por_correo(p_email text, p_dias int)
returns date language plpgsql security definer set search_path = public, auth as $$
declare u uuid; v date;
begin
  if not public.es_super() then raise exception 'Solo el súper administrador'; end if;
  select id into u from auth.users where lower(email) = lower(btrim(p_email));
  if u is null then raise exception 'No hay una cuenta con ese correo. Pídele que se registre primero'; end if;
  insert into public.premium_familias (user_id, hasta, origen) values (u, public.hoy_cl() + p_dias, 'correo')
    on conflict (user_id) do update set hasta = greatest(public.premium_familias.hasta, public.hoy_cl()) + p_dias, origen = 'correo', actualizado = now()
    returning hasta into v;
  return v;
end $$;

create or replace function public.super_premium_lista()
returns table (email text, hasta date, origen text) language sql stable security definer set search_path = public, auth as $$
  select u.email::text, p.hasta, p.origen from public.premium_familias p join auth.users u on u.id = p.user_id
  where public.es_super() order by p.hasta desc
$$;

-- 3) La biblioteca central considera también el Premium de la familia
create or replace function public.central_para(p_comunidad uuid, p_col text)
 RETURNS TABLE(id text, data jsonb, bloqueado boolean, visible boolean, desde date)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with c as (
    select greatest(
             case when co.plan_hasta is not null and co.plan_hasta < public.hoy_cl() then 0 else coalesce(p.orden, 0) end,
             case when public.premium_familia_activo() then (select coalesce(max(orden), 0) from public.planes) else 0 end) as orden
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
      and (p_col not in ('matprofes', 'maestras') or public.es_equipo(p_comunidad))
  )
  select q.id,
         case when q.lib or public.es_super() then q.data
              else jsonb_strip_nulls(jsonb_build_object('titulo', q.data->'titulo', 'numero', q.data->'numero', 'nombre', q.data->'nombre',
                     'desc', q.data->'desc', 'plan', q.data->'plan', 'fecha', q.data->'fecha', 'tipo', q.data->'tipo', 'orden', q.data->'orden',
                     'thumb', q.data->'thumb', 'libera_desde', q.data->'libera_desde', 'subtitulo', q.data->'subtitulo', 'cita', q.data->'cita',
                     'portadaMini', q.data->'portadaMini', 'parabola', q.data->'parabola', 'catPremium', q.data->'catPremium')) end,
         not q.lib, q.vis, q.vdesde
  from q
  where public.es_equipo(p_comunidad) or (q.vis and (q.vdesde is null or q.vdesde <= public.hoy_cl()))
$function$;

revoke all on function public.premium_familia_activo(), public.mi_premium(), public.canjear_codigo_premium(text),
  public.super_crear_codigo_premium(int, text), public.super_premium_por_correo(text, int), public.super_premium_lista() from public, anon;
grant execute on function public.premium_familia_activo(), public.mi_premium(), public.canjear_codigo_premium(text),
  public.super_crear_codigo_premium(int, text), public.super_premium_por_correo(text, int), public.super_premium_lista() to authenticated;

select 'Listo: Recursos Premium instalados' as resultado;
