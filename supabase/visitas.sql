-- ============================================================
-- Contador de visitas de eternopactokids.cl (parte en 7.000)
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar más de una vez.
-- ============================================================
create table if not exists public.visitas (id int primary key, total bigint not null default 7000, actualizado timestamptz default now());
insert into public.visitas (id, total) values (1, 7000) on conflict (id) do nothing;
alter table public.visitas enable row level security;  -- nadie la toca directo; solo por la función

create or replace function public.contar_visita(p_nueva boolean default true)
returns bigint language plpgsql security definer set search_path = public as $$
declare t bigint;
begin
  if p_nueva then
    update public.visitas set total = total + 1, actualizado = now() where id = 1 returning total into t;
  else
    select total into t from public.visitas where id = 1;
  end if;
  return t;
end $$;

revoke all on function public.contar_visita(boolean) from public;
grant execute on function public.contar_visita(boolean) to anon, authenticated;

select 'Listo: contador de visitas instalado' as resultado, public.contar_visita(false) as visitas;
