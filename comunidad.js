/* Eterno Pacto Kids · Foros y Retos (se integran a la app a través de window.EPKapp) */
(function () {
  "use strict";
  const A = () => window.EPKapp;
  const sb = () => window.EPK.sb;
  const cid = () => (window.EPK.comunidad || {}).id;
  const yo = () => (window.EPK.user || {}).id;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const equipo = () => window.EPK.super || ["admin", "maestro"].includes(window.EPK.rol);
  const admin = () => window.EPK.super || window.EPK.rol === "admin";
  const hoy = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const fFecha = (d) => new Date(d).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const fDia = (d) => new Date(d + "T12:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
  const errTxt = (e) => { const m = String((e && e.message) || e || ""); if (/row-level security|permission/i.test(m)) return "No tienes permiso para hacer eso aquí."; if (/fetch|network/i.test(m)) return "No hay conexión. Inténtalo otra vez."; return m || "Algo salió mal."; };
  const NINOS = ["Hijo", "Hija"];

  /* =================== FOROS =================== */
  const F = { vista: "inicio", foro: null, tema: null, foros: null, temas: {}, msgs: {}, err: null, com: null };
  function nivelOk(f, n) {
    if (window.EPK.super) return true;
    if (n === "todos") return true; if (n === "super") return false;
    if (f.comunidad_id && f.comunidad_id !== cid()) return false;
    return n === "miembros" || (n === "equipo" && equipo()) || (n === "admins" && admin());
  }
  const puedeEscribir = (f) => nivelOk(f, f.lectura) && nivelOk(f, f.escritura);
  const modera = (f) => window.EPK.super || (f.comunidad_id === cid() && equipo());
  async function cargarForos() {
    F.com = cid();
    const { data, error } = await sb().from("foros").select("*").order("orden").order("creado");
    if (error) { F.err = errTxt(error); F.foros = []; } else { F.err = null; F.foros = (data || []).filter((f) => !f.comunidad_id || f.comunidad_id === cid()); }
    A().render();
  }
  async function cargarTemas(fid) {
    const { data, error } = await sb().from("temas").select("*").eq("foro_id", fid).order("fijado", { ascending: false }).order("ultimo", { ascending: false }).limit(100);
    F.temas[fid] = error ? [] : data || []; if (error) A().toast(errTxt(error)); A().render();
  }
  async function cargarMsgs(tid) {
    const { data, error } = await sb().from("mensajes").select("*").eq("tema_id", tid).order("creado").limit(500);
    F.msgs[tid] = error ? [] : data || []; if (error) A().toast(errTxt(error)); A().render();
  }
  const foroDe = (id) => (F.foros || []).find((f) => f.id === id);
  const NIVTXT = { todos: "Abierto a todos", miembros: "Miembros", equipo: "Maestros y administradores", admins: "Administradores", super: "Súper administrador" };

  function vForo() {
    if (F.com !== cid()) { F.foros = null; F.vista = "inicio"; F.temas = {}; F.msgs = {}; }
    if (!F.foros) { cargarForos(); return `<p class="muted">Cargando foros…</p>`; }
    if (F.err) return `<div class="note">No se pudieron cargar los foros: ${esc(F.err)}</div>`;
    if (F.vista === "tema" && F.tema) return vTema();
    if (F.vista === "foro" && foroDe(F.foro)) return vUnForo(foroDe(F.foro));
    const raiz = F.foros.filter((f) => !f.padre_id || !foroDe(f.padre_id));
    const fila = (f) => { const subs = F.foros.filter((x) => x.padre_id === f.id); return `<button class="item" data-act="fx_foro" data-id="${esc(f.id)}"><span class="grow"><b>${esc(f.nombre)}</b><span class="muted small">${f.descripcion ? esc(f.descripcion) : ""}${subs.length ? `<br>Subforos: ${subs.map((x) => esc(x.nombre)).join(", ")}` : ""}</span></span>${f.lectura !== "miembros" && f.lectura !== "todos" ? `<span class="pill">${esc(NIVTXT[f.lectura])}</span>` : ""}${f.ninos ? `<span class="pill leaf">Niños</span>` : ""}</button>`; };
    const propios = raiz.filter((f) => f.comunidad_id), generales = raiz.filter((f) => !f.comunidad_id);
    let out = `<div class="note">Un lugar para animarnos, compartir y orar unos por otros. Los niños pueden escribir en el foro de su congregación desde el perfil de su familia, y un maestro aprueba sus mensajes antes de publicarlos.</div>`;
    out += `<div class="sec-h"><h2>Mi congregación</h2>${admin() ? `<button class="btn ghost sm" data-act="fx_nuevoForo">Nuevo subforo</button>` : ""}</div>`;
    out += propios.length ? `<div class="list">${propios.map(fila).join("")}</div>` : `<p class="muted">Tu congregación todavía no tiene foros.</p>`;
    out += `<div class="sec-h"><h2>Todas las congregaciones</h2></div>`;
    out += generales.length ? `<div class="list">${generales.map(fila).join("")}</div>` : `<p class="muted">No hay foros generales disponibles para ti.</p>`;
    return out;
  }
  function vUnForo(f) {
    if (!F.temas[f.id]) cargarTemas(f.id);
    const ts = F.temas[f.id]; const subs = F.foros.filter((x) => x.padre_id === f.id); const padre = foroDe(f.padre_id);
    let out = `<button class="back" data-act="fx_volver" data-to="${padre ? "foro:" + esc(padre.id) : "inicio"}">‹ ${padre ? esc(padre.nombre) : "Todos los foros"}</button>
    <section class="card"><p class="eyebrow">${f.comunidad_id ? "Foro de la congregación" : "Foro general"}</p><h2>${esc(f.nombre)}</h2>${f.descripcion ? `<p class="muted">${esc(f.descripcion)}</p>` : ""}
    <div class="row">${puedeEscribir(f) ? `<button class="btn sm" data-act="fx_nuevoTema">Nuevo tema</button>` : `<span class="pill">Solo lectura</span>`}${admin() && f.comunidad_id ? `<button class="btn ghost sm" data-act="fx_nuevoForo" data-padre="${esc(f.id)}">Nuevo subforo</button>` : ""}<button class="btn ghost sm" data-act="fx_recargar">Actualizar</button></div></section>`;
    if (subs.length) out += `<div class="list">${subs.map((x) => `<button class="item" data-act="fx_foro" data-id="${esc(x.id)}"><span class="grow"><b>↳ ${esc(x.nombre)}</b><span class="muted small">${esc(x.descripcion || "Subforo")}</span></span></button>`).join("")}</div>`;
    if (!ts) return out + `<p class="muted">Cargando temas…</p>`;
    out += ts.length ? `<div class="list">${ts.map((t) => `<button class="item" data-act="fx_tema" data-id="${esc(t.id)}"><span class="grow"><b>${t.fijado ? "📌 " : ""}${t.cerrado ? "🔒 " : ""}${esc(t.titulo)}</b><span class="muted small">${esc(t.autor || "")} · ${t.mensajes} mensaje${t.mensajes === 1 ? "" : "s"} · ${fFecha(t.ultimo)}</span></span></button>`).join("")}</div>`
      : `<section class="empty"><h3>Aún no hay temas</h3><p class="muted">${puedeEscribir(f) ? "Sé el primero en escribir: un saludo, un motivo de oración o una idea para las clases." : "Pronto habrá conversaciones aquí."}</p></section>`;
    return out;
  }
  function comoOpciones(f) {
    const L = A().BIB(); const ops = [["", "Yo (" + ((window.EPK.user && (window.EPK.user.user_metadata || {}).nombre) || "adulto") + ")"]];
    if (f.comunidad_id && f.ninos) Object.entries(L.lectores || {}).forEach(([n, o]) => { if (NINOS.includes(o.rol)) ops.push([n, n + " (con aprobación del maestro)"]); });
    return ops;
  }
  function vTema() {
    const t = F.tema; const f = foroDe(t.foro_id) || {};
    if (!F.msgs[t.id]) cargarMsgs(t.id);
    const ms = F.msgs[t.id]; const mod = modera(f);
    let out = `<button class="back" data-act="fx_volver" data-to="foro:${esc(t.foro_id)}">‹ ${esc(f.nombre || "Foro")}</button>
    <section class="card"><p class="eyebrow">${esc(f.nombre || "")}</p><h2>${t.fijado ? "📌 " : ""}${esc(t.titulo)}</h2><p class="muted small">Iniciado por ${esc(t.autor || "")} · ${fFecha(t.creado)}</p>
    ${mod ? `<div class="row"><button class="btn ghost sm" data-act="fx_fijar">${t.fijado ? "Desfijar" : "Fijar arriba"}</button><button class="btn ghost sm" data-act="fx_cerrar">${t.cerrado ? "Reabrir tema" : "Cerrar tema"}</button><button class="btn line sm" data-act="fx_borrarTema">Eliminar tema</button></div>` : ""}</section>`;
    if (!ms) return out + `<p class="muted">Cargando mensajes…</p>`;
    out += `<div class="list">${ms.map((m) => {
      const mio = m.autor_id === yo();
      return `<article class="post${m.estado !== "publicado" ? " pend" : ""}"><p class="muted small"><b>${esc(m.como || m.autor || "")}</b>${m.como ? ` <span class="pill leaf">Niño/a · familia ${esc(m.autor || "")}</span>` : ""} · ${fFecha(m.creado)} ${m.estado === "pendiente" ? `<span class="pill sun">Esperando aprobación</span>` : ""}${m.estado === "oculto" ? `<span class="pill">Oculto</span>` : ""}${mod && m.reportes ? ` <span class="pill">⚠ ${m.reportes} reporte${m.reportes > 1 ? "s" : ""}</span>` : ""}</p>
      <p style="white-space:pre-wrap">${esc(m.texto)}</p>
      <div class="row">${mod && m.estado !== "publicado" ? `<button class="btn sm" data-act="fx_estado" data-id="${esc(m.id)}" data-v="publicado">Aprobar</button>` : ""}${mod && m.estado === "publicado" ? `<button class="btn ghost sm" data-act="fx_estado" data-id="${esc(m.id)}" data-v="oculto">Ocultar</button>` : ""}${mio || mod ? `<button class="link-btn small" data-act="fx_borrarMsg" data-id="${esc(m.id)}">Eliminar</button>` : `<button class="link-btn small" data-act="fx_reportar" data-id="${esc(m.id)}">Reportar</button>`}</div></article>`;
    }).join("") || `<p class="muted">Sin mensajes.</p>`}</div>`;
    if (t.cerrado && !mod) return out + `<p class="muted">Este tema está cerrado.</p>`;
    if (!puedeEscribir(f)) return out;
    const ops = comoOpciones(f);
    out += `<section class="card"><h3 style="margin:0">Responder</h3>${ops.length > 1 ? `<label class="small">Escribe como <select class="inp" id="fxComo">${ops.map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`).join("")}</select></label>` : ""}
      <textarea class="inp" id="fxTexto" rows="4" maxlength="5000" placeholder="Escribe con cariño y respeto." aria-label="Tu mensaje" style="width:100%"></textarea>
      <button class="btn" style="align-self:flex-start" data-act="fx_enviar">Publicar</button></section>`;
    return out;
  }

  async function accionForo(act, b) {
    const id = b.dataset.id;
    switch (act) {
      case "fx_foro": F.vista = "foro"; F.foro = id; A().render(); window.scrollTo(0, 0); return;
      case "fx_tema": F.tema = (F.temas[F.foro] || []).find((t) => t.id === id); F.vista = "tema"; delete F.msgs[id]; A().render(); window.scrollTo(0, 0); return;
      case "fx_volver": { const to = b.dataset.to || "inicio"; if (to.startsWith("foro:")) { F.vista = "foro"; F.foro = to.slice(5); delete F.temas[F.foro]; } else F.vista = "inicio"; A().render(); window.scrollTo(0, 0); return; }
      case "fx_recargar": delete F.temas[F.foro]; F.foros = null; A().render(); return;
      case "fx_nuevoForo": {
        const padre = b.dataset.padre || null;
        A().openForm({ titulo: padre ? "Nuevo subforo" : "Nuevo foro de la congregación", ayuda: "Lo verán los miembros de tu congregación según el acceso que elijas. El súper administrador puede ajustar los permisos.",
          campos: [{ k: "nombre", label: "Nombre", req: true, ph: "Peticiones de oración" }, { k: "descripcion", label: "Descripción", type: "textarea" },
            { k: "lectura", label: "¿Quién puede leer y escribir?", type: "select", opts: [["miembros", "Todos los miembros"], ["equipo", "Solo maestros y administradores"], ["admins", "Solo administradores"]] },
            { k: "ninos", label: "¿Los niños pueden escribir (con aprobación)?", type: "select", opts: [["si", "Sí"], ["no", "No"]] }],
          datos: { lectura: "miembros", ninos: "si" },
          onSave: async (v) => {
            const { error } = await sb().from("foros").insert({ comunidad_id: cid(), padre_id: padre, nombre: v.nombre.trim(), descripcion: (v.descripcion || "").trim() || null, lectura: v.lectura, escritura: v.lectura, ninos: v.ninos === "si", orden: (F.foros || []).length + 1 });
            if (error) throw errTxt(error); F.foros = null; setTimeout(() => A().render(), 0);
          } });
        return;
      }
      case "fx_nuevoTema": {
        const f = foroDe(F.foro); if (!f) return;
        A().openForm({ titulo: "Nuevo tema en " + f.nombre, campos: [{ k: "titulo", label: "Título", req: true, ph: "Oremos por la familia González" }, { k: "texto", label: "Mensaje", type: "textarea", req: true }],
          onSave: async (v) => {
            const { data: t, error } = await sb().from("temas").insert({ foro_id: f.id, titulo: v.titulo.trim() }).select().single();
            if (error) throw errTxt(error);
            const { error: e2 } = await sb().from("mensajes").insert({ tema_id: t.id, texto: v.texto.trim() });
            if (e2) throw errTxt(e2);
            delete F.temas[f.id]; F.tema = t; F.vista = "tema"; delete F.msgs[t.id]; setTimeout(() => A().render(), 0);
          } });
        return;
      }
      case "fx_enviar": {
        const txt = (document.getElementById("fxTexto") || {}).value || ""; if (!txt.trim()) { A().toast("Escribe tu mensaje"); return; }
        const como = (document.getElementById("fxComo") || {}).value || "";
        b.disabled = true;
        const { error } = await sb().from("mensajes").insert({ tema_id: F.tema.id, texto: txt.trim(), como: como || null, es_nino: !!como });
        b.disabled = false; if (error) { A().toast(errTxt(error)); return; }
        A().toast(como ? "Enviado. Un maestro lo revisará antes de publicarlo." : "Mensaje publicado");
        document.getElementById("fxTexto").value = ""; delete F.msgs[F.tema.id]; A().render(); return;
      }
      case "fx_estado": { const { error } = await sb().from("mensajes").update({ estado: b.dataset.v, reportes: 0 }).eq("id", id); if (error) return A().toast(errTxt(error)); delete F.msgs[F.tema.id]; A().toast(b.dataset.v === "publicado" ? "Mensaje aprobado" : "Mensaje ocultado"); A().render(); return; }
      case "fx_borrarMsg": { if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "¿Eliminar?"; return; } const { error } = await sb().from("mensajes").delete().eq("id", id); if (error) return A().toast(errTxt(error)); delete F.msgs[F.tema.id]; A().render(); return; }
      case "fx_reportar": { if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "¿Reportar a los moderadores?"; return; } const { error } = await sb().rpc("reportar_mensaje", { p_mensaje: id }); if (error) return A().toast(errTxt(error)); b.textContent = "Reportado"; b.disabled = true; A().toast("Gracias. Un moderador lo revisará."); return; }
      case "fx_fijar": case "fx_cerrar": {
        const k = act === "fx_fijar" ? "fijado" : "cerrado"; const v = !F.tema[k];
        const { error } = await sb().from("temas").update({ [k]: v }).eq("id", F.tema.id); if (error) return A().toast(errTxt(error));
        F.tema[k] = v; delete F.temas[F.tema.foro_id]; A().render(); return;
      }
      case "fx_borrarTema": { if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "¿Eliminar el tema y sus mensajes?"; return; } const { error } = await sb().from("temas").delete().eq("id", F.tema.id); if (error) return A().toast(errTxt(error)); F.vista = "foro"; delete F.temas[F.tema.foro_id]; F.tema = null; A().render(); return; }
    }
  }

  /* =================== RETOS =================== */
  const R = { lista: null, tableros: {}, familias: null, com: null };
  const METRICAS = [["lecturas", "Todas las lecturas"], ["cuentos", "Cuentos leídos"], ["historias", "Historias bíblicas"], ["capitulos", "Capítulos de la Biblia"], ["actividades", "Actividades"], ["versiculos", "Versículos guardados"]];
  const MN = Object.fromEntries(METRICAS);
  async function cargarRetos() {
    R.com = cid();
    const desde = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const { data, error } = await sb().from("retos").select("*").eq("comunidad_id", cid()).in("estado", ["pendiente", "activo"]).gte("fin", desde).order("creado", { ascending: false });
    R.lista = error ? [] : data || []; if (error) R.err = errTxt(error); else R.err = null;
    R.tableros = {};
    await Promise.all(R.lista.filter((r) => r.estado === "activo").map(async (r) => { const { data: t } = await sb().rpc("reto_tablero", { p_reto: r.id }); R.tableros[r.id] = t || []; }));
    A().render();
  }
  async function familias() { if (!R.familias) { const { data } = await sb().rpc("familias_de", { p_comunidad: cid() }); R.familias = data || []; } return R.familias; }
  function tablero(r) {
    const t = R.tableros[r.id] || []; const max = Math.max(1, r.meta || 0, ...t.map((x) => x.puntaje));
    const fin = r.fin < hoy();
    if (!t.length) return `<p class="muted small">Aún no hay familias con lecturas registradas.</p>`;
    return `<div class="list">${t.slice(0, 15).map((x, i) => `<div class="item${x.es_mia ? " mia" : ""}"><span class="rank">${fin && i === 0 && x.puntaje > 0 ? "🏆" : i + 1}</span><span class="grow"><b>${esc(x.familia)}${x.es_mia ? " (tu familia)" : ""}</b><span class="bar" style="margin-top:6px"><i style="width:${(x.puntaje / max) * 100}%"></i></span></span><span class="stars">${x.puntaje}${r.meta ? `<span class="muted small">/${r.meta}</span>` : ""}</span></div>`).join("")}</div>`;
  }
  function vRetos() {
    if (R.com !== cid()) { R.lista = null; R.familias = null; }
    if (!R.lista) { cargarRetos(); return `<p class="muted">Cargando retos…</p>`; }
    let out = `<div class="note">Reta a otra familia o únete a los desafíos de la congregación. Cuentan las lecturas que cada familia marca en la app (cuentos, historias, capítulos, actividades y versículos) durante las fechas del reto.</div>
    <div class="row"><button class="btn sm" data-act="fx_retar">Retar a otra familia</button>${equipo() ? `<button class="btn ghost sm" data-act="fx_desafio">Nuevo desafío de la congregación</button>` : ""}<button class="btn ghost sm" data-act="fx_recargarRetos">Actualizar</button></div>`;
    if (R.err) out += `<div class="note">${esc(R.err)}</div>`;
    const inv = R.lista.filter((r) => r.estado === "pendiente" && r.retado === yo());
    const env = R.lista.filter((r) => r.estado === "pendiente" && r.creado_por === yo());
    const act = R.lista.filter((r) => r.estado === "activo");
    if (inv.length) out += `<div class="sec-h"><h2>Te retaron</h2></div>` + inv.map((r) => `<section class="card"><h3 style="margin:0">${esc(r.titulo)}</h3><p class="muted">${esc(MN[r.metrica])} durante ${r.dias} días${r.meta ? ` · meta ${r.meta}` : ""}${r.descripcion ? `<br>${esc(r.descripcion)}` : ""}</p><div class="row"><button class="btn sm" data-act="fx_responder" data-id="${esc(r.id)}" data-v="1">Aceptar el reto</button><button class="btn ghost sm" data-act="fx_responder" data-id="${esc(r.id)}" data-v="0">Ahora no</button></div></section>`).join("");
    if (env.length) out += `<div class="sec-h"><h2>Esperando respuesta</h2></div><div class="list">` + env.map((r) => `<div class="item"><span class="grow"><b>${esc(r.titulo)}</b><span class="muted small">${esc(MN[r.metrica])} · ${r.dias} días</span></span><button class="link-btn small" data-act="fx_cancelarReto" data-id="${esc(r.id)}">Cancelar</button></div>`).join("") + `</div>`;
    out += `<div class="sec-h"><h2>Retos en curso</h2></div>`;
    out += act.length ? act.map((r) => `<section class="card"><p class="eyebrow">${r.tipo === "congregacion" ? "Desafío de la congregación" : "Reto entre familias"} · ${r.fin < hoy() ? "Terminó" : "Termina"} el ${esc(fDia(r.fin))}</p><h3 style="margin:0">${esc(r.titulo)}</h3><p class="muted small">${esc(MN[r.metrica])}${r.meta ? ` · meta ${r.meta}` : ""}${r.descripcion ? " · " + esc(r.descripcion) : ""}</p>${tablero(r)}${r.creado_por === yo() || equipo() ? `<button class="link-btn small" style="align-self:flex-start" data-act="fx_cancelarReto" data-id="${esc(r.id)}">Cancelar reto</button>` : ""}</section>`).join("")
      : `<section class="empty"><h3>No hay retos activos</h3><p class="muted">Anímate a retar a otra familia: ¿quién lee más historias de la Biblia esta semana?</p></section>`;
    return out;
  }
  async function accionRetos(act, b) {
    const id = b.dataset.id;
    switch (act) {
      case "fx_recargarRetos": R.lista = null; A().render(); return;
      case "fx_retar": case "fx_desafio": {
        const cong = act === "fx_desafio"; let fams = [];
        if (!cong) { fams = await familias(); if (!fams.length) { A().toast("Aún no hay otras familias en tu congregación"); return; } }
        const campos = [];
        if (!cong) campos.push({ k: "retado", label: "Familia a retar", type: "select", req: true, opts: fams.map((f) => [f.user_id, f.familia]) });
        campos.push({ k: "titulo", label: "Nombre del reto", req: true, ph: cong ? "Semana de la Biblia en familia" : "¿Quién lee más esta semana?" },
          { k: "metrica", label: "¿Qué cuenta?", type: "select", opts: METRICAS },
          { k: "dias", label: "Duración", type: "select", opts: [["3", "3 días"], ["7", "1 semana"], ["14", "2 semanas"], ["30", "1 mes"]] },
          { k: "meta", label: "Meta (opcional)", type: "number", ph: "10" }, { k: "descripcion", label: "Mensaje o premio (opcional)", type: "textarea" });
        A().openForm({ titulo: cong ? "Nuevo desafío de la congregación" : "Retar a otra familia", ayuda: cong ? "Participan todas las familias de la congregación desde hoy." : "La otra familia recibirá la invitación y el reto empieza cuando la acepte.",
          campos, datos: { metrica: "lecturas", dias: "7", retado: fams[0] && fams[0].user_id },
          onSave: async (v) => {
            const row = { comunidad_id: cid(), tipo: cong ? "congregacion" : "familias", retado: cong ? null : v.retado, titulo: v.titulo.trim(), metrica: v.metrica, dias: Number(v.dias) || 7, meta: Number(v.meta) > 0 ? Number(v.meta) : null, descripcion: (v.descripcion || "").trim() || null, fin: hoy() };
            const { error } = await sb().from("retos").insert(row); if (error) throw errTxt(error);
            R.lista = null; A().toast(cong ? "Desafío creado" : "Invitación enviada"); setTimeout(() => A().render(), 0);
          } });
        return;
      }
      case "fx_responder": { const { error } = await sb().rpc("responder_reto", { p_reto: id, p_acepta: b.dataset.v === "1" }); if (error) return A().toast(errTxt(error)); R.lista = null; A().toast(b.dataset.v === "1" ? "¡Reto aceptado! A leer en familia." : "Reto rechazado"); A().render(); return; }
      case "fx_cancelarReto": { if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "¿Cancelar?"; return; } const { error } = await sb().rpc("cancelar_reto", { p_reto: id }); if (error) return A().toast(errTxt(error)); R.lista = null; A().render(); return; }
    }
  }

  /* =================== PERMISO, SOLICITUDES Y AVISOS =================== */
  const P = { com: null, info: null, pedidas: null, pref: null, push: null };
  function cargarPermiso() {
    if (P.com === cid() && P.info) return; P.com = cid(); P.info = {}; P.pedidas = new Set();
    Promise.all([
      sb().from("comunidades").select("plan_id,plan_hasta").eq("id", cid()).maybeSingle(),
      sb().from("planes").select("id,nombre"),
      admin() ? sb().from("solicitudes").select("col,doc_id").eq("comunidad_id", cid()).eq("estado", "pendiente") : Promise.resolve({ data: [] })
    ]).then(([c, pl, so]) => {
      const pn = Object.fromEntries((pl.data || []).map((x) => [x.id, x.nombre]));
      P.info = { ...(c.data || {}), nombre: pn[(c.data || {}).plan_id || "gratis"] || "Inicial" };
      (so.data || []).forEach((x) => P.pedidas.add(x.col + "/" + x.doc_id));
      A().render();
    }).catch(() => {});
  }
  function avisoPermiso() {
    if (!admin() || window.EPK.super) return "";
    cargarPermiso(); const i = P.info || {}; if (!i.plan_hasta) return "";
    const dias = Math.round((new Date(i.plan_hasta + "T12:00:00") - new Date(hoy() + "T12:00:00")) / 864e5);
    if (dias > 14) return "";
    const f = new Date(i.plan_hasta + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "long" });
    return `<p class="aviso-permiso" role="status">${dias < 0 ? `El permiso ${esc(i.nombre)} de tu congregación venció el ${f}. El material de ese nivel quedó con candado.` : `El permiso ${esc(i.nombre)} de tu congregación vence ${dias === 0 ? "hoy" : "el " + f}. Contacta al administrador de Eterno Pacto Kids para renovarlo.`}</p>`;
  }
  const pedido = (col, id) => { cargarPermiso(); return P.pedidas && P.pedidas.has(col + "/" + String(id).replace(/^c_/, "")); };
  function pedir(col, x) {
    const id = String(x.id).replace(/^c_/, "");
    A().openForm({ titulo: "Pedir acceso", ayuda: "Le llegará tu solicitud al súper administrador de Eterno Pacto Kids. Te avisará cuando lo libere.",
      datos: {}, campos: [{ k: "mensaje", label: "Mensaje (opcional)", type: "textarea", ph: "Nos gustaría usar este material con los niños desde el próximo mes." }],
      guardarTxt: "Enviar solicitud",
      onSave: async (v) => {
        const { error } = await sb().from("solicitudes").insert({ comunidad_id: cid(), col, doc_id: id, titulo: x.titulo || x.nombre || ("Cuento " + (x.numero || "")), mensaje: (v.mensaje || "").trim() || null });
        if (error) throw errTxt(error); P.pedidas.add(col + "/" + id); setTimeout(() => A().render(), 0);
      } });
  }

  const VAPID_PUBLIC = "BEouliY8VS3uiHD8aQqesSYXAd6M7H2-7e0NLiEUnI7gdi2DKtQxReVNwQO2O7YhzZ-DLq0djn6UO89R28DitKk";
  const b64u = (s) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); };
  const esIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const instalada = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  async function estadoPush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return esIOS() && !instalada() ? "instalar" : "no";
    if (Notification.permission === "denied") return "bloqueado";
    try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); return sub ? "on" : "off"; } catch (e) { return "off"; }
  }
  async function cargarAvisos() {
    if (P.pref && P.pushUid === yo()) return; P.pushUid = yo();
    P.pref = { push: true, correo: true, recordatorio: true };
    const [{ data }, est] = await Promise.all([sb().from("notif_pref").select("*").eq("user_id", yo()).maybeSingle(), estadoPush()]);
    if (data) P.pref = data; P.push = est; A().render();
  }
  async function activarPush() {
    const est = await estadoPush();
    if (est === "instalar") { A().toast("En iPhone, primero instala la app en la pantalla de inicio y ábrela desde su ícono."); return; }
    if (est === "no") { A().toast("Este navegador no permite avisos. Prueba con Chrome o instala la app."); return; }
    if (est === "bloqueado") { A().toast("Los avisos están bloqueados. Actívalos en los ajustes del navegador para esta página."); return; }
    const perm = await Notification.requestPermission(); if (perm !== "granted") { A().toast("No se activaron los avisos"); return; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(VAPID_PUBLIC) });
    const j = sub.toJSON();
    const { error } = await sb().from("push_subs").upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_id: yo() });
    if (error) { A().toast(errTxt(error)); return; }
    P.push = "on"; A().toast("¡Listo! Te avisaremos en este dispositivo."); A().render();
  }
  async function desactivarPush() {
    try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) { await sb().from("push_subs").delete().eq("endpoint", sub.endpoint); await sub.unsubscribe(); } } catch (e) {}
    P.push = "off"; A().render();
  }
  async function guardarPref(k, v) {
    P.pref = { ...P.pref, [k]: v };
    const { error } = await sb().from("notif_pref").upsert({ user_id: yo(), push: P.pref.push !== false, correo: P.pref.correo !== false, recordatorio: P.pref.recordatorio !== false });
    if (error) A().toast(errTxt(error)); else A().toast("Preferencia guardada"); A().render();
  }
  function vAvisos() {
    cargarAvisos(); const p = P.pref || {}; const st = P.push;
    const pushTxt = { on: "Activados en este dispositivo", off: "Desactivados en este dispositivo", bloqueado: "Bloqueados en el navegador", instalar: "En iPhone: instala la app primero", no: "Este navegador no los permite" }[st] || "Revisando…";
    return `<section class="card avisos"><div class="sec-h"><h2>Avisos</h2></div>
      <p class="muted small">Te avisamos cuando hay una clase nueva, cuando otra familia te reta y cuando se publica el mensaje de tu hijo.</p>
      <div class="av-fila"><span class="grow"><b>📱 Avisos en el celular</b><span class="muted small">${pushTxt}</span></span>${st === "on" ? `<button class="btn line sm" data-act="fx_pushOff">Desactivar</button>` : `<button class="btn sm" data-act="fx_pushOn">Activar</button>`}</div>
      <label class="av-fila"><span class="grow"><b>✉️ Avisos por correo</b><span class="muted small">Clase nueva disponible</span></span><input type="checkbox" data-pref="correo" ${p.correo !== false ? "checked" : ""}></label>
      <label class="av-fila"><span class="grow"><b>⏰ Recordatorio del sábado</b><span class="muted small">"Mañana es la escuela dominical"</span></span><input type="checkbox" data-pref="recordatorio" ${p.recordatorio !== false ? "checked" : ""}></label></section>`;
  }
  document.addEventListener("change", (e) => { const t = e.target; if (t.dataset && t.dataset.pref) guardarPref(t.dataset.pref, t.checked); });

  window.EPKX = {
    avisoPermiso, pedido, pedir, vAvisos,
    vForo, vRetos,
    async accion(act, b) { try { if (act === "fx_pushOn") return await activarPush(); if (act === "fx_pushOff") return await desactivarPush(); if (/^fx_(retar|desafio|responder|cancelarReto|recargarRetos)$/.test(act)) await accionRetos(act, b); else await accionForo(act, b); } catch (e) { A().toast(errTxt(e)); } },
    pendientes: () => (R.lista || []).filter((r) => r.estado === "pendiente" && r.retado === yo()).length
  };
})();
