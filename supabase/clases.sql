-- =====================================================================
-- Eterno Pacto Kids · Clases modelo de la biblioteca central
-- Las congregaciones las programan con su propia fecha. Se ejecuta DESPUÉS de mejoras.sql.
-- =====================================================================
create or replace function public.central_para(p_comunidad uuid, p_col text)
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
      and (p_col not in ('matprofes', 'maestras') or public.es_equipo(p_comunidad))
  )
  select q.id,
         case when q.lib or public.es_super() then q.data
              else jsonb_strip_nulls(jsonb_build_object('titulo', q.data->'titulo', 'numero', q.data->'numero', 'nombre', q.data->'nombre',
                     'desc', q.data->'desc', 'plan', q.data->'plan', 'fecha', q.data->'fecha', 'tipo', q.data->'tipo', 'orden', q.data->'orden',
                     'thumb', q.data->'thumb', 'libera_desde', q.data->'libera_desde', 'subtitulo', q.data->'subtitulo', 'cita', q.data->'cita',
                     'portadaMini', q.data->'portadaMini', 'parabola', q.data->'parabola')) end,
         not q.lib, q.vis, q.vdesde
  from q
  where public.es_equipo(p_comunidad) or (q.vis and (q.vdesde is null or q.vdesde <= public.hoy_cl()))
$$;
revoke all on function public.central_para(uuid, text) from public, anon;
grant execute on function public.central_para(uuid, text) to authenticated;

-- Clase N°14 (si ya existe, no se reemplaza para no borrar los archivos que se le hayan agregado)
insert into public.docs (comunidad_id, col, id, data, actualizado)
values (public.central_id(), 'maestras', 'clase-014', $j${"numero": 14, "titulo": "El mayordomo infiel", "subtitulo": "Usa con sabiduría lo que Dios te confía", "parabola": "Parábola N.º 14 · Museo de Parábolas", "cita": "Lucas 16:1-13", "portada": "img/clases/parabola-14.jpg", "portadaMini": "img/clases/parabola-14-mini.jpg", "objetivo": "Que los niños descubran que todo lo que tienen viene de Dios, y que Él les pide cuidarlo y usarlo con fidelidad y sabiduría, empezando por las cosas pequeñas y pensando en bendecir a otros.", "resumen": "Jesús contó la historia de un mayordomo, un hombre encargado de cuidar los bienes de su patrón. Pero no los cuidó bien y su patrón decidió despedirlo. Antes de irse, el mayordomo pensó rápido y usó lo que todavía tenía a su cargo para hacerse amigos que lo recibieran después.\n\nJesús no aplaudió que fuera deshonesto, sino que pensara en su futuro. Y nos dejó una gran enseñanza: todo lo que tenemos —nuestro tiempo, nuestros juguetes, nuestros talentos, nuestro dinero— es de Dios y nos lo prestó para cuidarlo. Si somos fieles y honestos en las cosas pequeñas, Dios nos confiará cosas más grandes. ¡Y lo que Dios nos da también puede bendecir a otros!", "versiculo": "El que es fiel en lo muy poco, también en lo más es fiel.", "versiculoCita": "Lucas 16:10", "guia": "1. BIENVENIDA (5 min)\nPregunta para empezar: «¿Alguna vez alguien te prestó algo muy valioso para que lo cuidaras? ¿Cómo lo cuidaste?». Escucha algunas respuestas y cuenta que hoy veremos la historia de un hombre a quien le prestaron muchas cosas.\n\n2. LA HISTORIA (10 min)\nLean juntos Lucas 16:1-13 o cuéntala con tus palabras: un hombre rico tenía un mayordomo que cuidaba su dinero y sus cosas. Le contaron que el mayordomo malgastaba todo. El patrón le pidió las cuentas, porque ya no trabajaría más para él. El mayordomo pensó: «¿Qué haré ahora?». Llamó a quienes le debían a su patrón y les rebajó la deuda, para que fueran sus amigos cuando se quedara sin trabajo.\n\n3. ¿QUÉ NOS ENSEÑA JESÚS? (10 min)\n• Todo es de Dios: «De Jehová es la tierra y su plenitud» (Salmo 24:1). Nosotros solo somos administradores.\n• Fieles en lo poco: cuidar mi pieza, mis útiles, mi mascota o mi mesada es una forma de obedecer a Dios.\n• Pensar en el futuro: el mayordomo pensó en su mañana; nosotros pensamos en la eternidad y en agradar a Dios.\n• Bendecir a otros: lo que Dios nos da también puede ayudar a los demás.\n• Un solo Señor: «Ningún siervo puede servir a dos señores» (Lucas 16:13). Amamos a Dios más que a las cosas.\nNota para el maestro: Jesús no alaba la deshonestidad del mayordomo; destaca que fue astuto para preparar su futuro. Explícalo con sencillez para que nadie entienda que mentir está bien.\n\n4. ACTIVIDAD (10 min): EL COFRE DEL MAYORDOMO\nCada niño dibuja un cofre en una hoja y adentro tres cosas que Dios le confió (por ejemplo: mi familia, mis juguetes, mi tiempo). Al lado escribe o dibuja cómo puede cuidarla o compartirla esta semana.\n\n5. ORACIÓN Y CIERRE (5 min)\nOren juntos: «Señor, gracias por todo lo que nos prestas. Ayúdanos a cuidarlo con fidelidad y a usarlo para bendecir a otros. Amén». Repasen el versículo de memoria.", "preguntasRepaso": "¿Qué hacía un mayordomo?\n¿Qué hizo el mayordomo cuando supo que lo iban a despedir?\n¿Jesús aplaudió que fuera deshonesto?\n¿Qué cosas pequeñas te ha confiado Dios a ti?\n¿Cómo podemos usar lo que tenemos para bendecir a otros?", "tarea": "Esta semana elige UNA cosa pequeña que Dios te confió (tu pieza, tus útiles, tu mascota, tu mesada o tu tiempo) y cuídala con fidelidad todos los días. Anota o dibuja cómo lo hiciste y cuéntalo el domingo.", "consideraciones": "Traer la Biblia. Para la actividad: hojas, lápices de colores y, si se puede, una cajita o sobre por niño para el «cofre».", "archivos": [], "plan": "gratis"}$j$::jsonb, now())
on conflict (comunidad_id, col, id) do nothing;

select 'Listo: clases modelo instaladas' as resultado;
