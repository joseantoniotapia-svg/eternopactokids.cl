// Eterno Pacto Kids · función "notificar": envía avisos al celular (web push) y por correo (Resend).
// La llama cada 10 minutos una tarea programada (supabase/cron.sql). Cada aviso se envía una sola vez (tabla notificados).
// Claves que se configuran en Supabase → Edge Functions → Secrets:
//   VAPID_PRIVATE_KEY  (obligatoria para avisos al celular)
//   RESEND_API_KEY     (opcional: sin ella no se envían correos)
//   MAIL_FROM          (opcional, por defecto "Eterno Pacto Kids <avisos@eternopactokids.cl>")
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const APP = "https://eternopactokids.cl";
const VAPID_PUBLIC = "BEouliY8VS3uiHD8aQqesSYXAd6M7H2-7e0NLiEUnI7gdi2DKtQxReVNwQO2O7YhzZ-DLq0djn6UO89R28DitKk";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const PRIV = Deno.env.get("VAPID_PRIVATE_KEY");
if (PRIV) webpush.setVapidDetails("mailto:avisos@eternopactokids.cl", VAPID_PUBLIC, PRIV);
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("MAIL_FROM") || "Eterno Pacto Kids <avisos@eternopactokids.cl>";

type Aviso = { titulo: string; texto: string; url: string; tag?: string };

function ahoraCL() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false, weekday: "short" })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) % 24, sabado: p.weekday === "Sat" };
}
const sumarDias = (f: string, n: number) => { const d = new Date(f + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// true si es la primera vez (y lo deja registrado)
async function nuevo(tipo: string, ref: string) {
  const { error } = await sb.from("notificados").insert({ tipo, ref });
  if (!error) return true;
  if (error.code !== "23505") console.error("notificados", error.message);
  return false;
}
async function prefs(ids: string[]) {
  if (!ids.length) return {} as Record<string, any>;
  const { data } = await sb.from("notif_pref").select("*").in("user_id", ids);
  return Object.fromEntries((data || []).map((x: any) => [x.user_id, x]));
}
async function miembros(comunidad: string, roles?: string[]) {
  let q = sb.from("miembros").select("user_id,rol").eq("comunidad_id", comunidad);
  if (roles) q = q.in("rol", roles);
  const { data } = await q; return (data || []).map((m: any) => m.user_id as string);
}
async function enviarPush(ids: string[], a: Aviso) {
  if (!PRIV || !ids.length) return 0;
  const { data: subs } = await sb.from("push_subs").select("*").in("user_id", ids);
  let n = 0;
  for (const s of subs || []) {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(a), { TTL: 86400 }); n++; }
    catch (e: any) { if (e && (e.statusCode === 404 || e.statusCode === 410)) await sb.from("push_subs").delete().eq("endpoint", s.endpoint); else console.error("push", e && e.statusCode, e && e.body); }
  }
  return n;
}
let USERS: Record<string, string> | null = null;
async function correos(ids: string[]) {
  if (!USERS) { USERS = {}; for (let page = 1; page < 20; page++) { const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 }); if (error || !data.users.length) break; data.users.forEach((u) => { if (u.email) USERS![u.id] = u.email; }); if (data.users.length < 1000) break; } }
  return ids.map((i) => USERS![i]).filter(Boolean);
}
function plantilla(titulo: string, cuerpo: string, boton: string, url: string) {
  return `<div style="background:#FFF4E4;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1E1548">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:3px solid #2A1E5C;border-radius:22px;overflow:hidden">
  <div style="background:linear-gradient(120deg,#7A4DFF,#FF3D8B 60%,#FF7A1A);padding:18px 22px;color:#fff"><img src="${APP}/img/icono-192.png" width="48" height="48" alt="" style="vertical-align:middle;border-radius:12px"> <b style="font-size:18px;vertical-align:middle">Eterno Pacto Kids</b></div>
  <div style="padding:22px"><h1 style="margin:0 0 10px;font-size:22px">${esc(titulo)}</h1><div style="font-size:16px;line-height:1.5">${cuerpo}</div>
  <p style="margin:22px 0 6px"><a href="${url}" style="background:#5B3DF5;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:999px;display:inline-block">${esc(boton)}</a></p></div>
  <div style="padding:14px 22px;background:#FFF4E4;font-size:12px;color:#5F5680">Recibes este correo porque perteneces a una congregación en Eterno Pacto Kids. Puedes desactivarlo en la app: Más → Mi familia → Avisos.</div></div></div>`;
}
async function enviarCorreos(destinos: string[], asunto: string, html: string) {
  if (!RESEND || !destinos.length) return 0;
  let n = 0;
  for (let i = 0; i < destinos.length; i += 100) {
    const lote = destinos.slice(i, i + 100).map((to) => ({ from: FROM, to: [to], subject: asunto, html }));
    const r = await fetch("https://api.resend.com/emails/batch", { method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" }, body: JSON.stringify(lote) });
    if (r.ok) n += lote.length; else console.error("resend", r.status, await r.text());
  }
  return n;
}
async function nombreFamilia(uid: string) {
  const { data: f } = await sb.from("familias").select("data").eq("user_id", uid).maybeSingle();
  const n = f && f.data && f.data.familia && f.data.familia.nombre; if (n) return n;
  const { data: p } = await sb.from("perfiles").select("nombre").eq("id", uid).maybeSingle(); return (p && p.nombre) || "Una familia";
}

Deno.serve(async () => {
  const r = { clases: 0, retos: 0, pendientes: 0, aprobados: 0, recordatorios: 0, push: 0, correos: 0 };
  const { fecha, hora, sabado } = ahoraCL();
  // Sin claves configuradas no se marca nada como avisado, para no perder avisos
  if (!PRIV && !RESEND) return new Response(JSON.stringify({ ok: true, push_activo: false, correo_activo: false, nota: "Faltan VAPID_PRIVATE_KEY y RESEND_API_KEY" }), { headers: { "Content-Type": "application/json" } });
  try {
    // 1. Clases nuevas (de esta semana o próximas, visibles para las familias)
    const { data: clases } = await sb.from("docs").select("comunidad_id,id,data").eq("col", "clases").gte("data->>fecha", sumarDias(fecha, -6)).limit(500);
    for (const c of clases || []) {
      const d = c.data || {};
      if (d.visible === "no" || (d.publicar && d.publicar > fecha)) continue;
      if (!(await nuevo("clase", c.comunidad_id + "/" + c.id))) continue;
      const ids = await miembros(c.comunidad_id); const url = `${APP}/?com=${c.comunidad_id}`;
      r.push += await enviarPush(ids, { titulo: "¡Nueva clase disponible!", texto: d.titulo + (d.cita ? " · " + d.cita : ""), url, tag: "clase-" + c.id });
      const pf = await prefs(ids);
      const html = plantilla("¡Nueva clase disponible!", `<p style="font-size:20px;font-weight:bold;margin:0">${esc(d.titulo)}</p>${d.cita ? `<p style="margin:4px 0">${esc(d.cita)}</p>` : ""}${d.resumen ? `<p>${esc(d.resumen)}</p>` : ""}${d.versiculo ? `<p style="background:#FFD23F;border-radius:12px;padding:12px">“${esc(d.versiculo)}”${d.versiculoCita ? `<br><b>${esc(d.versiculoCita)}</b>` : ""}</p>` : ""}`, "Ver la clase", url);
      r.correos += await enviarCorreos(await correos(ids.filter((i) => !pf[i] || pf[i].correo !== false)), "Nueva clase: " + d.titulo, html);
      r.clases++;
    }
    if (!PRIV) return new Response(JSON.stringify({ ok: true, push_activo: false, correo_activo: true, ...r }), { headers: { "Content-Type": "application/json" } });
    // 2. Retos entre familias que esperan respuesta
    const { data: retos } = await sb.from("retos").select("*").eq("estado", "pendiente").gte("creado", new Date(Date.now() - 2 * 864e5).toISOString());
    for (const x of retos || []) {
      if (!x.retado || !(await nuevo("reto", x.id))) continue;
      r.push += await enviarPush([x.retado], { titulo: "¡Te retaron! 🏆", texto: `${await nombreFamilia(x.creado_por)} te retó: ${x.titulo}`, url: `${APP}/?com=${x.comunidad_id}#puntos`, tag: "reto-" + x.id }); r.retos++;
    }
    // 3. Mensajes de niños: aviso al equipo cuando esperan aprobación y a la familia cuando se publican
    const { data: msgs } = await sb.from("mensajes").select("id,autor_id,como,estado,creado,temas(titulo,foros(comunidad_id,nombre))").eq("es_nino", true).gte("creado", new Date(Date.now() - 7 * 864e5).toISOString());
    for (const m of (msgs || []) as any[]) {
      const foro = m.temas && m.temas.foros; if (!foro || !foro.comunidad_id) continue;
      const url = `${APP}/?com=${foro.comunidad_id}#mas`;
      if (m.estado === "pendiente" && (await nuevo("pend", m.id))) {
        r.push += await enviarPush(await miembros(foro.comunidad_id, ["admin", "maestro"]), { titulo: "Mensaje por aprobar", texto: `${m.como || "Un niño"} escribió en "${m.temas.titulo}"`, url, tag: "pend-" + m.id }); r.pendientes++;
      }
      if (m.estado === "publicado" && (await nuevo("aprob", m.id))) {
        r.push += await enviarPush([m.autor_id], { titulo: "¡Mensaje publicado!", texto: `Ya se ve el mensaje de ${m.como || "tu hijo"} en ${foro.nombre}`, url, tag: "aprob-" + m.id }); r.aprobados++;
      }
    }
    // 4. Recordatorio del sábado (desde las 10:00) para las congregaciones con clase el domingo
    if (sabado && hora >= 10) {
      const manana = sumarDias(fecha, 1);
      const { data: dom } = await sb.from("docs").select("comunidad_id,id,data").eq("col", "clases").eq("data->>fecha", manana);
      for (const c of dom || []) {
        const d = c.data || {}; if (d.visible === "no" || (d.publicar && d.publicar > manana)) continue;
        if (!(await nuevo("recordatorio", c.comunidad_id + "/" + manana))) continue;
        const ids = await miembros(c.comunidad_id); const pf = await prefs(ids);
        r.push += await enviarPush(ids.filter((i) => !pf[i] || pf[i].recordatorio !== false), { titulo: "Mañana es la escuela dominical ⛪", texto: `Clase: ${d.titulo}.${d.versiculoCita ? " ¿Repasaron el versículo " + d.versiculoCita + "?" : ""}`, url: `${APP}/?com=${c.comunidad_id}`, tag: "rec-" + manana });
        r.recordatorios++;
      }
    }
  } catch (e) { console.error(e); return new Response(JSON.stringify({ ok: false, error: String(e), ...r }), { status: 500, headers: { "Content-Type": "application/json" } }); }
  return new Response(JSON.stringify({ ok: true, push_activo: !!PRIV, correo_activo: !!RESEND, ...r }), { headers: { "Content-Type": "application/json" } });
});
