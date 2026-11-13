/* Eterno Pacto Kids · Panel de Control del súper administrador */
(function () {
  "use strict";
  const SB_URL = "https://izkqplqwxoszwqpzxwrb.supabase.co";
  const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6a3FwbHF3eG9zendxcHp4d3JiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MDU2MjMsImV4cCI6MjExMDA4MTYyM30.o9TizvJI1wvRRMRh-FfUDnw4bP8PT8m_jzQBath49YY";
  const CENTRAL = "00000000-0000-0000-0000-000000000001";
  const BUCKET = "archivos";
  const sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const blobUrl = (id) => SB_URL + "/storage/v1/object/public/" + BUCKET + "/" + String(id || "").split("/").map(encodeURIComponent).join("/");
  const fmtFecha = (d) => d ? new Date(d).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" }) : "–";
  const fmtFechaHora = (d) => d ? new Date(d).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "nunca";
  const fmtMB = (b) => !b ? "" : b >= 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
  const nK = (o) => Object.keys(o || {}).length;
  const ROLN = { admin: "Administrador", maestro: "Maestro", familia: "Familia" };
  const PTS = { presente: 10, versiculo: 15, biblia: 5, tarea: 10 };
  const REGIONES = ["Arica y Parinacota", "Tarapacá", "Antofagasta", "Atacama", "Coquimbo", "Valparaíso", "Metropolitana", "O'Higgins", "Maule", "Ñuble", "Biobío", "La Araucanía", "Los Ríos", "Los Lagos", "Aysén", "Magallanes"];
  const COLN = { clases: "Clases", cuentos: "Cuentos", materiales: "Material niños", matprofes: "Material profes", muro: "Muro", biblicos: "Personajes bíblicos", links: "Enlaces", contactos: "Contactos", premios: "Premios", compromisos: "Cartas", parabolas: "Parábolas", ninos: "Niños", asistencia: "Asistencia", bonos: "Estrellas", libro: "Libro de clases", config: "Configuración" };
  const MODERABLES = ["muro", "materiales", "matprofes", "cuentos", "biblicos", "links", "contactos", "clases", "premios", "compromisos", "parabolas"];

  const D = { comunidades: [], usuarios: [], docs: [], familias: [], miembros: [], planes: [], excepciones: [], foros: [], mensajes: [], solicitudes: [] };
  const NIVN = { todos: "Todos los usuarios", miembros: "Miembros", equipo: "Maestros y admins", admins: "Solo administradores", super: "Solo súper admin" };
  const CENTRAL_COLS = [["cuentos", "Cuentos"], ["materiales", "Material niños"], ["matprofes", "Material profes"], ["biblicos", "Personajes"]];
  const ui = { tab: "resumen", com: null, buscar: "", bib: "cuentos", modCol: "", modCom: "", subida: null, matCol: "cuentos", foroCom: "" };
  let yo = null;

  let toastT;
  function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2800); }
  const err = (e) => toast("Error: " + ((e && (e.message || e.error_description)) || e));

  /* ---------- acceso ---------- */
  function gate(html) { $("#app").hidden = true; const g = $("#gate"); g.hidden = false; g.innerHTML = `<div class="card">${html}</div>`; }
  async function iniciar() {
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      gate(`<h1>Panel de Control</h1><p class="muted">Ingresa con tu cuenta de súper administrador.</p>
      <form id="lf" class="form" style="grid-template-columns:1fr"><div class="field"><label for="le">Correo</label><input class="inp" id="le" type="email" autocomplete="email" required></div>
      <div class="field"><label for="lp">Contraseña</label><input class="inp" id="lp" type="password" autocomplete="current-password" required></div>
      <p id="lm" class="small" style="color:var(--rose)" hidden></p><button class="btn" type="submit">Ingresar</button></form><a class="small" href="/">Volver a la app</a>`);
      $("#lf").addEventListener("submit", async (e) => {
        e.preventDefault();
        const { error } = await sb.auth.signInWithPassword({ email: $("#le").value.trim(), password: $("#lp").value });
        if (error) { const m = $("#lm"); m.textContent = "Correo o contraseña incorrectos."; m.hidden = false; return; }
        iniciar();
      });
      return;
    }
    yo = data.session.user;
    const { data: s, error } = await sb.rpc("soy_super");
    if (error || !s) {
      gate(`<h1>Acceso restringido</h1><p class="muted">Esta sección es solo para el súper administrador de Eterno Pacto Kids. Tu cuenta (${esc(yo.email)}) no tiene ese permiso.</p><a class="btn" href="/">Volver a la app</a>`);
      return;
    }
    $("#gate").hidden = true; $("#app").hidden = false;
    $("#quien").textContent = yo.email;
    await cargar();
  }

  async function cargar() {
    $("#main").innerHTML = `<p class="muted">Cargando datos…</p>`;
    try {
      const [pl, ex, fo, me, so] = await Promise.all([
        sb.from("planes").select("*").order("orden"),
        sb.from("excepciones").select("*"),
        sb.from("foros").select("*").order("orden"),
        sb.from("mensajes").select("id,tema_id,autor,como,es_nino,texto,estado,reportes,creado,temas(titulo,foro_id)").or("estado.eq.pendiente,reportes.gt.0").order("creado", { ascending: false }).limit(300),
        sb.from("solicitudes").select("*").order("creado", { ascending: false }).limit(300)
      ]);
      D.solicitudes = (so && so.data) || [];
      D.planes = pl.data || []; D.excepciones = ex.data || []; D.foros = fo.data || []; D.mensajes = me.data || [];
      if (pl.error) console.warn("Falta ejecutar supabase/plataforma.sql:", pl.error.message);
      const [c, u, d, f, m] = await Promise.all([
        sb.from("comunidades").select("*").order("creado"),
        sb.rpc("super_usuarios"),
        sb.from("docs").select("comunidad_id,col,id,data,actualizado").limit(20000),
        sb.from("familias").select("user_id,data,actualizado"),
        sb.from("miembros").select("comunidad_id,user_id,rol,creado")
      ]);
      for (const r of [c, u, d, f, m]) if (r.error) throw r.error;
      D.comunidades = c.data || []; D.usuarios = u.data || []; D.docs = d.data || []; D.familias = f.data || []; D.miembros = m.data || [];
    } catch (e) { $("#main").innerHTML = `<div class="card"><h2>No se pudieron cargar los datos</h2><p>${esc(e.message || e)}</p><button class="btn" onclick="location.reload()">Reintentar</button></div>`; return; }
    render();
  }

  /* ---------- cálculos ---------- */
  const congregaciones = () => D.comunidades.filter((c) => c.id !== CENTRAL);
  const docsDe = (cid, col) => D.docs.filter((d) => d.comunidad_id === cid && (!col || d.col === col));
  const nombreCom = (cid) => cid === CENTRAL ? "Biblioteca central" : ((D.comunidades.find((c) => c.id === cid) || {}).nombre || "–");
  const usuario = (id) => D.usuarios.find((u) => u.user_id === id);
  function lectoresDe(fam) { const l = (fam && fam.data && fam.data.lectores) || {}; return Object.entries(l).map(([n, o]) => ({ nombre: n, rol: o.rol || "", cuentos: nK(o.cuentos), historias: nK(o.plan), capitulos: nK(o.leidos), actividades: nK(o.mats), insignias: nK(o.insignias), versiculos: (o.favs || []).length })); }
  const lecturasTot = (x) => x.cuentos + x.historias + x.capitulos + x.actividades;
  function statsNinos(cid) {
    const ninos = docsDe(cid, "ninos"); const asis = docsDe(cid, "asistencia"); const bonos = docsDe(cid, "bonos"); const libro = docsDe(cid, "libro");
    return ninos.map((n) => {
      const r = { id: n.id, nombre: n.data.nombre || "–", apoderado: n.data.apoderado || "", presente: 0, versiculo: 0, biblia: 0, tarea: 0, estrellas: 0, notas: [], obs: "" };
      asis.forEach((a) => Object.keys(PTS).forEach((k) => { if ((a.data[k] || []).includes(n.id)) { r[k]++; r.estrellas += PTS[k]; } }));
      bonos.forEach((b) => { if (b.data.ninoId === n.id) r.estrellas += Number(b.data.pts) || 0; });
      libro.slice().sort((a, b) => (a.actualizado < b.actualizado ? 1 : -1)).forEach((l) => {
        const nt = l.data.notas && l.data.notas[n.id]; if (nt != null) r.notas.push(Number(nt));
        const o = l.data.obs && l.data.obs[n.id]; if (o && !r.obs) r.obs = o;
      });
      r.promedio = r.notas.length ? r.notas.reduce((a, b) => a + b, 0) / r.notas.length : null;
      return r;
    }).sort((a, b) => b.estrellas - a.estrellas);
  }
  const clasesConRegistro = (cid) => docsDe(cid, "asistencia").length;
  function ultimaActividad(cid) { let m = null; docsDe(cid).forEach((d) => { if (!m || d.actualizado > m) m = d.actualizado; }); return m; }
  const miembrosDe = (cid) => D.miembros.filter((m) => m.comunidad_id === cid);
  const familiasDe = (cid) => { const ids = new Set(miembrosDe(cid).map((m) => m.user_id)); return D.familias.filter((f) => ids.has(f.user_id)); };
  const planOrden = (id) => ((D.planes.find((p) => p.id === (id || "gratis")) || {}).orden) || 0;
  const planNombre = (id) => (D.planes.find((p) => p.id === (id || "gratis")) || {}).nombre || "Inicial";
  const excepcion = (cid, col, id) => D.excepciones.find((e) => e.comunidad_id === cid && e.col === col && e.doc_id === id);
  const hoyCL = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const vencido = (c) => !!(c.plan_hasta && c.plan_hasta < hoyCL());
  function liberado(c, d) {
    const e = excepcion(c.id, d.col, d.id);
    if (e && (!e.desde || e.desde <= hoyCL())) return e.liberado;
    return planOrden(d.data.plan) <= (vencido(c) ? 0 : planOrden(c.plan_id)) && (!d.data.libera_desde || d.data.libera_desde <= hoyCL());
  }
  const planSelect = (attrs, val) => `<select class="inp" ${attrs}>${(D.planes.length ? D.planes : [{ id: "gratis", nombre: "Inicial" }]).map((p) => `<option value="${esc(p.id)}" ${p.id === (val || "gratis") ? "selected" : ""}>${esc(p.nombre)}</option>`).join("")}</select>`;
  const semana = (d) => { const t = new Date(d); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return t; };

  /* ---------- vistas ---------- */
  const TABS = [["resumen", "Resumen"], ["congregaciones", "Congregaciones"], ["usuarios", "Usuarios"], ["biblioteca", "Biblioteca central"], ["permisos", "Permisos"], ["foros", "Foros"], ["moderacion", "Moderación"]];
  function render() {
    const cnt = { congregaciones: congregaciones().length, usuarios: D.usuarios.length, biblioteca: docsDe(CENTRAL).filter((d) => d.col !== "parabolas").length, foros: D.mensajes.filter((m) => m.estado === "pendiente" || m.reportes > 0).length || null, permisos: D.solicitudes.filter((x) => x.estado === "pendiente").length || null };
    $("#nav").innerHTML = TABS.map(([k, n]) => `<button data-tab="${k}" ${ui.tab === k ? 'aria-current="page"' : ""}><span>${n}</span>${cnt[k] != null ? `<span class="cnt">${cnt[k]}</span>` : ""}</button>`).join("");
    const v = { resumen: vResumen, congregaciones: vCongregaciones, usuarios: vUsuarios, biblioteca: vBiblioteca, permisos: vPermisos, foros: vForos, moderacion: vModeracion }[ui.tab];
    $("#main").innerHTML = v();
  }

  function vResumen() {
    const coms = congregaciones();
    const lects = D.familias.flatMap((f) => lectoresDe(f));
    const totLect = lects.reduce((a, l) => a + lecturasTot(l), 0);
    const totIns = lects.reduce((a, l) => a + l.insignias, 0);
    const ninos = D.docs.filter((d) => d.col === "ninos" && d.comunidad_id !== CENTRAL).length;
    const k = [
      ["Usuarios registrados", D.usuarios.length], ["Congregaciones", coms.length], ["Niños inscritos", ninos],
      ["Perfiles familiares", lects.length], ["Lecturas registradas", totLect], ["Insignias ganadas", totIns],
      ["Clases creadas", D.docs.filter((d) => d.col === "clases").length], ["Cuentos disponibles", D.docs.filter((d) => d.col === "cuentos").length]
    ];
    // usuarios nuevos por semana (12 semanas)
    const hoy = semana(new Date()); const weeks = [];
    for (let i = 11; i >= 0; i--) { const w = new Date(hoy); w.setDate(w.getDate() - 7 * i); weeks.push({ w, n: 0 }); }
    D.usuarios.forEach((u) => { const s = semana(u.creado).getTime(); const x = weeks.find((y) => y.w.getTime() === s); if (x) x.n++; });
    const maxW = Math.max(1, ...weeks.map((x) => x.n));
    // distribución geográfica
    const porRegion = {}; const porPais = {};
    coms.forEach((c) => {
      const r = c.region || "Sin región"; const p = c.pais || "Sin país"; const mi = miembrosDe(c.id).length;
      porRegion[r] = porRegion[r] || { c: 0, u: 0 }; porRegion[r].c++; porRegion[r].u += mi;
      porPais[p] = porPais[p] || { c: 0, u: 0 }; porPais[p].c++; porPais[p].u += mi;
    });
    const barras = (obj) => { const arr = Object.entries(obj).sort((a, b) => b[1].u - a[1].u || b[1].c - a[1].c); const mx = Math.max(1, ...arr.map((x) => x[1].u));
      return arr.length ? `<div class="bars">${arr.map(([n, v]) => `<div class="bar" title="${esc(n)}: ${v.c} congregaciones, ${v.u} usuarios"><span class="lbl">${esc(n)}</span><span class="track"><span class="fill" style="width:${(v.u / mx) * 100}%;display:block"></span></span><span class="n">${v.u}</span></div>`).join("")}</div><p class="muted small">Usuarios por ${obj === porPais ? "país" : "región"} según la ubicación de su congregación.</p>` : `<p class="empty">Aún no hay congregaciones.</p>`; };
    // cuentos más leídos (lecturas registradas por los perfiles de las familias)
    const lecturas = {}; let versos = 0, quizzes = 0;
    D.familias.forEach((f) => Object.values((f.data && f.data.lectores) || {}).forEach((o) => {
      Object.keys((o && o.cuentos) || {}).forEach((id) => { lecturas[id] = (lecturas[id] || 0) + 1; });
      versos += Object.keys((o && o.versos) || {}).length; quizzes += Object.keys((o && o.quiz) || {}).length;
    }));
    const tituloCuento = (id) => { const cid = id.replace(/^c_/, ""); const d = D.docs.find((x) => x.col === "cuentos" && x.id === cid && (id.startsWith("c_") ? x.comunidad_id === CENTRAL : true)); return d ? `${d.data.numero != null ? d.data.numero + ". " : ""}${d.data.titulo || ""}` : id; };
    const top = Object.entries(lecturas).sort((a, b) => b[1] - a[1]).slice(0, 10); const maxT = Math.max(1, ...top.map((x) => x[1]));
    const hace30 = new Date(Date.now() - 30 * 864e5).toISOString();
    const actividad = coms.map((c) => { const ult = [ultimaActividad(c.id), ...miembrosDe(c.id).map((m) => (usuario(m.user_id) || {}).ultimo_ingreso)].filter(Boolean).sort().pop() || null;
      const activos = miembrosDe(c.id).filter((m) => ((usuario(m.user_id) || {}).ultimo_ingreso || "") >= hace30).length; return { c, ult, activos }; })
      .sort((a, b) => (a.ult || "") < (b.ult || "") ? 1 : -1);
    k.push(["Versículos practicados", versos], ["Cuestionarios respondidos", quizzes]);
    const extra = `<section class="card"><h2>Cuentos más leídos</h2>${top.length ? `<div class="bars">${top.map(([id, n]) => `<div class="bar"><span class="lbl">${esc(tituloCuento(id))}</span><span class="track"><span class="fill" style="width:${(n / maxT) * 100}%;display:block"></span></span><span class="n">${n}</span></div>`).join("")}</div>` : `<p class="empty">Aún no hay lecturas registradas.</p>`}</section>
      <section class="card"><h2>Actividad de las congregaciones</h2>${actividad.length ? `<div class="tbl"><table><thead><tr><th>Congregación</th><th class="num">Activos (30 días)</th><th>Último movimiento</th><th></th></tr></thead><tbody>${actividad.map((x) => `<tr><td>${esc(x.c.nombre)}</td><td class="num">${x.activos} / ${miembrosDe(x.c.id).length}</td><td class="small">${fmtFechaHora(x.ult)}</td><td>${!x.ult || x.ult < hace30 ? '<span class="pill bad">Inactiva</span>' : '<span class="pill ok">Activa</span>'}</td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">Sin congregaciones.</p>`}</section>`;
    const recientes = D.docs.filter((d) => d.comunidad_id !== CENTRAL && MODERABLES.includes(d.col)).sort((a, b) => (a.actualizado < b.actualizado ? 1 : -1)).slice(0, 8);
    return `<div class="head"><div><p class="eyebrow">Súper administrador</p><h1>Resumen general</h1></div><span class="muted small">Datos al ${fmtFechaHora(new Date())}</span></div>
    <div class="kpis">${k.map(([n, v]) => `<div class="kpi"><b>${v.toLocaleString("es-CL")}</b><span>${n}</span></div>`).join("")}</div>
    <div class="grid">
      <section class="card"><h2>Nuevos usuarios por semana</h2><div class="cols" role="img" aria-label="Nuevos usuarios en las últimas 12 semanas">${weeks.map((x, i) => `<div class="c" tabindex="0"><span class="tip">Semana del ${x.w.toLocaleDateString("es-CL", { day: "numeric", month: "short" })}: ${x.n}</span><i class="${x.n ? "" : "zero"}" style="height:${x.n ? Math.max(4, (x.n / maxW) * 100) : 2}%"></i>${i % 2 === 1 ? `<span>${x.w.toLocaleDateString("es-CL", { day: "numeric", month: "short" })}</span>` : ""}</div>`).join("")}</div><p class="muted small">Últimas 12 semanas · máximo ${maxW} en una semana.</p></section>
      ${extra}
      <section class="card"><h2>Distribución por región</h2>${barras(porRegion)}</section>
      <section class="card"><h2>Distribución por país</h2>${barras(porPais)}</section>
      <section class="card"><h2>Actividad reciente</h2>${recientes.length ? `<div class="tbl"><table><tbody>${recientes.map((d) => `<tr><td>${esc(resumenDoc(d))}<div class="muted small">${esc(COLN[d.col] || d.col)} · ${esc(nombreCom(d.comunidad_id))}</div></td><td class="num small muted">${fmtFechaHora(d.actualizado)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">Sin actividad todavía.</p>`}</section>
    </div>`;
  }
  function resumenDoc(d) { const x = d.data || {}; return x.titulo || x.nombre || (x.texto ? String(x.texto).slice(0, 90) : "") || x.motivo || d.id; }

  function vCongregaciones() {
    if (ui.com) { const c = D.comunidades.find((x) => x.id === ui.com); if (c) return vCongregacion(c); ui.com = null; }
    const q = ui.buscar.toLowerCase();
    const coms = congregaciones().filter((c) => !q || [c.nombre, c.ciudad, c.region, c.pais, c.codigo].join(" ").toLowerCase().includes(q));
    return `<div class="head"><div><p class="eyebrow">Súper administrador</p><h1>Congregaciones</h1></div><input class="search" id="buscar" type="search" placeholder="Buscar por nombre, ciudad o código" value="${esc(ui.buscar)}" aria-label="Buscar congregación"></div>
    ${coms.length ? `<div class="tbl"><table><thead><tr><th>Congregación</th><th>Ubicación</th><th class="num">Miembros</th><th class="num">Niños</th><th class="num">Clases</th><th class="num">Cuentos</th><th>Permiso</th><th>Última actividad</th></tr></thead><tbody>
    ${coms.map((c) => `<tr class="click" data-com="${esc(c.id)}" tabindex="0"><td><b>${esc(c.nombre)}</b><div class="muted small">Código <span class="code">${esc(c.codigo)}</span> · desde ${fmtFecha(c.creado)}</div></td><td>${esc([c.ciudad, c.region, c.pais].filter(Boolean).join(", ") || "Sin ubicación")}</td><td class="num">${miembrosDe(c.id).length}</td><td class="num">${docsDe(c.id, "ninos").length}</td><td class="num">${docsDe(c.id, "clases").length}</td><td class="num">${docsDe(c.id, "cuentos").length}</td><td><span class="pill ${c.plan_id && c.plan_id !== "gratis" ? "acc" : ""}">${esc(planNombre(c.plan_id))}</span></td><td class="small">${fmtFechaHora(ultimaActividad(c.id))}</td></tr>`).join("")}
    </tbody></table></div>` : `<p class="empty">${q ? "Ninguna congregación coincide." : "Aún no hay congregaciones."}</p>`}`;
  }

  function vCongregacion(c) {
    const mi = miembrosDe(c.id).map((m) => ({ ...m, u: usuario(m.user_id) || {} })).sort((a, b) => a.rol.localeCompare(b.rol));
    const ninos = statsNinos(c.id); const regs = clasesConRegistro(c.id);
    const fams = familiasDe(c.id);
    const cont = {}; docsDe(c.id).forEach((d) => (cont[d.col] = (cont[d.col] || 0) + 1));
    return `<button class="back" data-act="volverCom">‹ Todas las congregaciones</button>
    <div class="head"><div><p class="eyebrow">Congregación</p><h1>${esc(c.nombre)}</h1><p class="muted small">Código <span class="code">${esc(c.codigo)}</span> · creada el ${fmtFecha(c.creado)}</p></div>
    <div class="row"><a class="btn" href="/?com=${esc(c.id)}" target="_blank" rel="noopener">Abrir en la app como administrador ↗</a></div></div>
    <section class="card"><h2>Datos y ubicación</h2><form class="form" id="fCom">
      <div class="field"><label for="cNom">Nombre</label><input class="inp" id="cNom" value="${esc(c.nombre)}" maxlength="80" required></div>
      <div class="field"><label for="cCiu">Ciudad o comuna</label><input class="inp" id="cCiu" value="${esc(c.ciudad || "")}"></div>
      <div class="field"><label for="cReg">Región</label><input class="inp" id="cReg" list="regiones" value="${esc(c.region || "")}"><datalist id="regiones">${REGIONES.map((r) => `<option value="${esc(r)}">`).join("")}</datalist></div>
      <div class="field"><label for="cPai">País</label><input class="inp" id="cPai" value="${esc(c.pais || "")}"></div>
      <div class="field" style="justify-content:flex-end"><button class="btn" type="submit">Guardar cambios</button></div></form></section>
    ${vPlanCom(c)}
    <section class="card"><div class="row between"><h2>Miembros (${mi.length})</h2><form id="fAdd" class="row"><input class="inp" id="addEmail" type="email" placeholder="correo de un usuario registrado" aria-label="Correo del usuario a agregar"><select class="inp" id="addRol" aria-label="Rol">${["familia", "maestro", "admin"].map((r) => `<option value="${r}">${ROLN[r]}</option>`).join("")}</select><button class="btn sm" type="submit">Agregar</button></form></div>
      ${mi.length ? `<div class="tbl"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Último ingreso</th><th></th></tr></thead><tbody>${mi.map((m) => `<tr><td>${esc(m.u.nombre || "Sin nombre")}${m.u.suspendido ? ' <span class="pill bad">Suspendido</span>' : ""}</td><td>${esc(m.u.email || "")}</td>
      <td><select class="inp" data-rol="${esc(m.user_id)}" aria-label="Rol de ${esc(m.u.nombre || "")}">${["familia", "maestro", "admin"].map((r) => `<option value="${r}" ${r === m.rol ? "selected" : ""}>${ROLN[r]}</option>`).join("")}</select></td>
      <td class="small">${fmtFechaHora(m.u.ultimo_ingreso)}</td><td><button class="btn danger sm" data-quitar="${esc(m.user_id)}">Quitar</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">Sin miembros.</p>`}</section>
    <section class="card"><h2>Niños (${ninos.length}) · ${regs} domingos con registro</h2>
      ${ninos.length ? `<div class="tbl"><table><thead><tr><th>Niño/a</th><th>Apoderado</th><th class="num">Asistencias</th><th class="num">Versículos</th><th class="num">Biblia</th><th class="num">Tareas</th><th class="num">Estrellas</th><th class="num">Promedio</th><th>Última observación</th></tr></thead><tbody>
      ${ninos.map((n) => `<tr><td><b>${esc(n.nombre)}</b></td><td>${esc(n.apoderado)}</td><td class="num">${n.presente}${regs ? `<span class="muted small"> / ${regs}</span>` : ""}</td><td class="num">${n.versiculo}</td><td class="num">${n.biblia}</td><td class="num">${n.tarea}</td><td class="num"><b>${n.estrellas}</b></td><td class="num">${n.promedio != null ? `<span class="pill ${n.promedio < 4 ? "bad" : "ok"}">${n.promedio.toFixed(1).replace(".", ",")}</span>` : "–"}</td><td class="small">${esc(n.obs)}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="empty">Esta congregación aún no inscribe niños.</p>`}</section>
    <section class="card"><h2>Lectura en familia</h2>
      ${fams.length ? `<div class="tbl"><table><thead><tr><th>Cuenta</th><th>Perfil</th><th class="num">Cuentos</th><th class="num">Historias</th><th class="num">Capítulos</th><th class="num">Actividades</th><th class="num">Versículos</th><th class="num">Insignias</th></tr></thead><tbody>
      ${fams.flatMap((f) => { const u = usuario(f.user_id) || {}; return lectoresDe(f).map((l) => `<tr><td class="small">${esc(u.nombre || u.email || "")}</td><td><b>${esc(l.nombre)}</b> <span class="muted small">${esc(l.rol)}</span></td><td class="num">${l.cuentos}</td><td class="num">${l.historias}</td><td class="num">${l.capitulos}</td><td class="num">${l.actividades}</td><td class="num">${l.versiculos}</td><td class="num">${l.insignias}</td></tr>`); }).join("")}
      </tbody></table></div>` : `<p class="empty">Ninguna familia de esta congregación ha creado perfiles de lectura todavía.</p>`}</section>
    <section class="card"><h2>Contenido</h2><div class="row">${Object.entries(cont).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="pill acc">${esc(COLN[k] || k)}: ${v}</span>`).join("") || '<span class="muted">Sin contenido.</span>'}</div>
      <button class="btn line sm" style="align-self:flex-start" data-act="moderarCom" data-id="${esc(c.id)}">Revisar contenido en Moderación</button></section>
    <section class="card danger-zone"><h2>Eliminar congregación</h2><p class="small">Borra la congregación con todas sus clases, niños, notas y contenido. Los usuarios siguen existiendo. <b>No se puede deshacer.</b></p>
      <form class="row" id="fDel"><input class="inp" id="delNom" placeholder="Escribe el nombre exacto para confirmar" aria-label="Nombre de la congregación para confirmar" style="min-width:260px"><button class="btn danger" type="submit">Eliminar definitivamente</button></form></section>`;
  }

  function vPlanCom(c) {
    const items = docsDe(CENTRAL, ui.matCol).sort((a, b) => (a.data.numero || 0) - (b.data.numero || 0) || String(a.data.titulo || a.data.nombre || "").localeCompare(String(b.data.titulo || b.data.nombre || ""), "es"));
    const lib = items.filter((d) => liberado(c, d)).length;
    return `<section class="card"><div class="row between"><h2>Permiso y material liberado</h2><label class="row small">Permiso de la congregación ${planSelect(`id="planCom" aria-label="Plan de la congregación"`, c.plan_id)}</label></div>
      <p class="muted small">El permiso libera todo el material de la biblioteca central de ese nivel o menor. Con la columna "Acceso" haces excepciones para esta congregación: liberar algo de un plan superior o bloquear algo puntual. Lo bloqueado se ve en la app con un candado, pero no se puede abrir.</p>
      <div class="seg" role="group" aria-label="Tipo de material">${CENTRAL_COLS.map(([k, n]) => `<button aria-pressed="${ui.matCol === k}" data-matcol="${k}">${n} (${docsDe(CENTRAL, k).length})</button>`).join("")}</div>
      ${items.length ? `<p class="small"><b>${lib}</b> de ${items.length} liberados para esta congregación.</p><div class="tbl"><table><thead><tr><th></th><th>Material</th><th>Permiso del material</th><th>Acceso</th><th>Estado</th></tr></thead><tbody>
      ${items.map((d) => { const e = excepcion(c.id, d.col, d.id); const ok = liberado(c, d); return `<tr><td>${d.data.thumb ? `<img class="thumb" src="${esc(blobUrl(d.data.thumb))}" alt="" loading="lazy">` : ""}</td><td><b>${d.data.numero != null ? esc(d.data.numero) + ". " : ""}${esc(d.data.titulo || d.data.nombre || d.id)}</b></td><td>${esc(planNombre(d.data.plan))}</td>
        <td><select class="inp" data-exc="${esc(d.id)}" data-col="${esc(d.col)}" aria-label="Acceso"><option value="">Según el permiso</option><option value="1" ${e && e.liberado ? "selected" : ""}>Liberado siempre</option><option value="0" ${e && !e.liberado ? "selected" : ""}>Bloqueado siempre</option></select>${e ? `<div class="small muted" style="margin-top:4px">desde <input class="inp" type="date" data-excdesde="${esc(d.id)}" data-col="${esc(d.col)}" value="${esc(e.desde || "")}" aria-label="Aplicar desde"></div>` : ""}</td>
        <td>${ok ? '<span class="pill ok">Liberado</span>' : '<span class="pill warn">🔒 Bloqueado</span>'}</td></tr>`; }).join("")}</tbody></table></div>` : `<p class="empty">No hay material de este tipo en la biblioteca central.</p>`}</section>`;
  }

  function vPermisos() {
    const central = D.docs.filter((d) => d.comunidad_id === CENTRAL && CENTRAL_COLS.some(([k]) => k === d.col));
    const porPlan = (id) => central.filter((d) => (d.data.plan || "gratis") === id).length;
    const coms = congregaciones().filter((c) => !ui.buscar || [c.nombre, c.ciudad, c.region].join(" ").toLowerCase().includes(ui.buscar.toLowerCase()));
    return `<div class="head"><div><p class="eyebrow">Súper administrador</p><h1>Permisos</h1></div><input class="search" id="buscar" type="search" placeholder="Buscar congregación" value="${esc(ui.buscar)}" aria-label="Buscar congregación"></div>
    <p class="muted">Cada congregación tiene un permiso. Con él ve abierto todo el material de la biblioteca central de ese nivel o menor; lo demás le aparece con candado. Las excepciones puntuales se hacen dentro de cada congregación. Si pones una fecha en "Vence", al pasar esa fecha la congregación vuelve a Inicial sola, y su administrador ve un aviso desde 14 días antes.</p>
    <section class="card"><h2>Niveles de permiso</h2><div class="tbl"><table><thead><tr><th>Nivel</th><th>Nombre</th><th>Descripción</th><th class="num">Material de este nivel</th><th class="num">Congregaciones</th></tr></thead><tbody>
      ${D.planes.map((p) => `<tr><td><span class="pill acc">${p.orden + 1}</span></td><td><input class="inp" data-plann="${esc(p.id)}" data-k="nombre" value="${esc(p.nombre)}" maxlength="30" aria-label="Nombre del permiso" style="width:130px"></td>
        <td><input class="inp" data-plann="${esc(p.id)}" data-k="descripcion" value="${esc(p.descripcion || "")}" maxlength="120" aria-label="Descripción" style="width:100%;min-width:220px"></td>
        <td class="num">${porPlan(p.id)}</td><td class="num">${congregaciones().filter((c) => (c.plan_id || "gratis") === p.id).length}</td></tr>`).join("")}</tbody></table></div>
      <p class="muted small">Los cambios de nombre y descripción se guardan al salir de la casilla.</p></section>
    ${vSolicitudes()}
    <section class="card"><h2>Permiso de cada congregación (${coms.length})</h2>
      ${coms.length ? `<div class="tbl"><table><thead><tr><th>Congregación</th><th>Ubicación</th><th>Permiso</th><th>Vence</th><th class="num">Material liberado</th><th class="num">Excepciones</th><th></th></tr></thead><tbody>
      ${coms.map((c) => { const lib = central.filter((d) => liberado(c, d)).length; const ex = D.excepciones.filter((e) => e.comunidad_id === c.id).length;
        return `<tr><td><b>${esc(c.nombre)}</b><div class="muted small">${miembrosDe(c.id).length} miembros</div></td><td class="small">${esc([c.ciudad, c.region].filter(Boolean).join(", ") || "–")}</td>
        <td>${planSelect(`data-plancom="${esc(c.id)}" aria-label="Permiso de ${esc(c.nombre)}"`, c.plan_id)}</td>
        <td><input class="inp" type="date" data-vence="${esc(c.id)}" value="${esc(c.plan_hasta || "")}" aria-label="Vencimiento del permiso de ${esc(c.nombre)}">${vencido(c) ? ' <span class="pill bad">Vencido</span>' : (c.plan_hasta && c.plan_hasta <= new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10) ? ' <span class="pill warn">Por vencer</span>' : "")}</td>
        <td class="num">${lib} / ${central.length}</td><td class="num">${ex || "–"}</td>
        <td><button class="btn line sm" data-act="verCom" data-id="${esc(c.id)}">Excepciones ›</button></td></tr>`; }).join("")}</tbody></table></div>` : `<p class="empty">No hay congregaciones.</p>`}</section>`;
  }

  function vSolicitudes() {
    const pend = D.solicitudes.filter((x) => x.estado === "pendiente"); const otras = D.solicitudes.filter((x) => x.estado !== "pendiente").slice(0, 10);
    const fila = (x) => { const u = usuario(x.user_id) || {}; return `<tr><td><b>${esc(x.titulo || x.doc_id)}</b><div class="muted small">${esc(COLN[x.col] || x.col || "")}</div>${x.mensaje ? `<div class="small">"${esc(x.mensaje)}"</div>` : ""}</td>
      <td class="small">${esc(nombreCom(x.comunidad_id))}<br><span class="muted">${esc(u.nombre || u.email || "")}</span></td><td class="small">${fmtFechaHora(x.creado)}</td>
      <td>${x.estado === "pendiente" ? `<div class="row"><button class="btn sm" data-sol="${esc(x.id)}" data-v="aprobar">Liberar</button><button class="btn ghost sm" data-sol="${esc(x.id)}" data-v="rechazar">Rechazar</button></div>` : `<span class="pill ${x.estado === "aprobada" ? "ok" : ""}">${x.estado === "aprobada" ? "Liberado" : "Rechazada"}</span>`}</td></tr>`; };
    return `<section class="card"><h2>Solicitudes de acceso (${pend.length})</h2><p class="muted small">Los administradores de cada congregación pueden pedir material que les aparece con candado. "Liberar" lo abre solo para esa congregación.</p>
      ${pend.length + otras.length ? `<div class="tbl"><table><thead><tr><th>Material</th><th>Congregación</th><th>Fecha</th><th></th></tr></thead><tbody>${pend.concat(otras).map(fila).join("")}</tbody></table></div>` : `<p class="empty">No hay solicitudes.</p>`}</section>`;
  }

  function vForos() {
    const coms = congregaciones();
    const fs = D.foros.filter((f) => ui.foroCom === "" ? !f.comunidad_id : f.comunidad_id === ui.foroCom);
    const raiz = fs.filter((f) => !f.padre_id || !fs.some((x) => x.id === f.padre_id));
    const fila = (f, sub) => `<tr><td>${sub ? "↳ " : ""}<b>${esc(f.nombre)}</b>${f.descripcion ? `<div class="small muted">${esc(f.descripcion)}</div>` : ""}</td>
      <td><select class="inp" data-foro="${esc(f.id)}" data-k="lectura" aria-label="Quién lee">${Object.entries(NIVN).map(([k, n]) => `<option value="${k}" ${f.lectura === k ? "selected" : ""}>${n}</option>`).join("")}</select></td>
      <td><select class="inp" data-foro="${esc(f.id)}" data-k="escritura" aria-label="Quién escribe">${Object.entries(NIVN).map(([k, n]) => `<option value="${k}" ${f.escritura === k ? "selected" : ""}>${n}</option>`).join("")}</select></td>
      <td>${f.comunidad_id ? `<select class="inp" data-foro="${esc(f.id)}" data-k="ninos" aria-label="Niños"><option value="false">No</option><option value="true" ${f.ninos ? "selected" : ""}>Sí, con aprobación</option></select>` : '<span class="muted small">Solo adultos</span>'}</td>
      <td><button class="btn danger sm" data-borrarforo="${esc(f.id)}">Eliminar</button></td></tr>`;
    const pend = D.mensajes;
    return `<div class="head"><div><p class="eyebrow">Súper administrador</p><h1>Foros</h1></div>
      <select class="inp" id="foroCom" aria-label="Foros de"><option value="">Foros generales (todas las congregaciones)</option>${coms.map((c) => `<option value="${esc(c.id)}" ${ui.foroCom === c.id ? "selected" : ""}>${esc(c.nombre)}</option>`).join("")}</select></div>
    <p class="muted small">Tú decides quién puede leer y escribir en cada foro. "Miembros" en un foro general significa cualquier persona inscrita en alguna congregación; en un foro de congregación, solo sus miembros. Los niños escriben solo en foros de su congregación marcados para niños, y sus mensajes esperan la aprobación de un maestro.</p>
    <section class="card">${fs.length ? `<div class="tbl"><table><thead><tr><th>Foro</th><th>Quién lee</th><th>Quién escribe</th><th>Niños</th><th></th></tr></thead><tbody>
      ${raiz.map((f) => fila(f, false) + fs.filter((x) => x.padre_id === f.id).map((x) => fila(x, true)).join("")).join("")}</tbody></table></div>` : `<p class="empty">No hay foros aquí todavía.</p>`}
      <form class="row" id="fForo"><input class="inp" id="foroNom" placeholder="Nombre del nuevo foro" maxlength="80" aria-label="Nombre del nuevo foro" style="min-width:220px">
      <select class="inp" id="foroPadre" aria-label="Dentro de"><option value="">Foro principal</option>${raiz.map((f) => `<option value="${esc(f.id)}">Subforo de ${esc(f.nombre)}</option>`).join("")}</select>
      <button class="btn sm" type="submit">Crear foro</button></form></section>
    <section class="card"><h2>Mensajes por revisar (${pend.length})</h2><p class="muted small">Mensajes de niños esperando aprobación y mensajes reportados, de todas las congregaciones.</p>
      ${pend.length ? `<div class="tbl"><table><thead><tr><th>Mensaje</th><th>Foro / tema</th><th>Estado</th><th></th></tr></thead><tbody>${pend.map((m) => { const fo = D.foros.find((f) => m.temas && f.id === m.temas.foro_id) || {}; return `<tr><td>${esc(String(m.texto).slice(0, 220))}<div class="small muted">${esc(m.como ? m.como + " (con " + m.autor + ")" : m.autor)} · ${fmtFechaHora(m.creado)}</div></td>
        <td class="small">${esc(fo.nombre || "")}${fo.comunidad_id ? " · " + esc(nombreCom(fo.comunidad_id)) : ""}<br><span class="muted">${esc((m.temas && m.temas.titulo) || "")}</span></td>
        <td>${m.estado === "pendiente" ? '<span class="pill warn">Pendiente</span>' : m.estado === "oculto" ? '<span class="pill">Oculto</span>' : ""}${m.reportes ? ` <span class="pill bad">${m.reportes} reporte${m.reportes > 1 ? "s" : ""}</span>` : ""}</td>
        <td class="row"><button class="btn sm" data-msg="${esc(m.id)}" data-v="publicado">Aprobar</button><button class="btn ghost sm" data-msg="${esc(m.id)}" data-v="oculto">Ocultar</button><button class="btn danger sm" data-msg="${esc(m.id)}" data-v="borrar">Eliminar</button></td></tr>`; }).join("")}</tbody></table></div>` : `<p class="empty">No hay mensajes por revisar.</p>`}</section>`;
  }

  function vUsuarios() {
    const q = ui.buscar.toLowerCase();
    const us = D.usuarios.filter((u) => !q || [u.nombre, u.email, ...(u.comunidades || []).map((c) => c.nombre)].join(" ").toLowerCase().includes(q));
    return `<div class="head"><div><p class="eyebrow">Súper administrador</p><h1>Usuarios</h1></div><div class="row"><input class="search" id="buscar" type="search" placeholder="Buscar por nombre, correo o congregación" value="${esc(ui.buscar)}" aria-label="Buscar usuario"><button class="btn ghost" data-act="csv">Descargar CSV</button></div></div>
    <div class="tbl"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Congregaciones</th><th>Registro</th><th>Último ingreso</th><th>Estado</th><th></th></tr></thead><tbody>
    ${us.map((u) => `<tr><td><b>${esc(u.nombre || "Sin nombre")}</b>${u.es_super ? ' <span class="pill acc">Súper admin</span>' : ""}</td><td>${esc(u.email)}</td>
      <td class="small">${(u.comunidades || []).map((c) => `${esc(c.nombre)} <span class="muted">(${ROLN[c.rol] || c.rol})</span>`).join("<br>") || '<span class="muted">Sin congregación</span>'}</td>
      <td class="small">${fmtFecha(u.creado)}</td><td class="small">${fmtFechaHora(u.ultimo_ingreso)}</td>
      <td>${u.suspendido ? '<span class="pill bad">Suspendido</span>' : '<span class="pill ok">Activo</span>'}</td>
      <td>${u.user_id === yo.id ? "" : `<button class="btn ${u.suspendido ? "ghost" : "danger"} sm" data-susp="${esc(u.user_id)}" data-v="${u.suspendido ? "0" : "1"}">${u.suspendido ? "Reactivar" : "Suspender"}</button>`}</td></tr>`).join("") || `<tr><td colspan="7" class="muted">Ningún usuario coincide.</td></tr>`}
    </tbody></table></div><p class="muted small">Suspender quita todo el acceso de esa cuenta a la app y sus datos, sin borrarla. Puedes reactivarla cuando quieras.</p>`;
  }

  function vBiblioteca() {
    const seg = [["cuentos", "Cuentos"], ["materiales", "Material para niños"], ["matprofes", "Material para profes"]];
    const items = docsDe(CENTRAL, ui.bib).sort((a, b) => ui.bib === "cuentos" ? (a.data.numero || 0) - (b.data.numero || 0) : (a.actualizado < b.actualizado ? 1 : -1));
    const pg = ui.subida;
    return `<div class="head"><div><p class="eyebrow">Para todas las congregaciones</p><h1>Biblioteca central</h1></div></div>
    <p class="muted">Lo que subas aquí aparece en la app de <b>todas</b> las congregaciones, marcado como "Biblioteca central". El material para profes solo lo ven maestros y administradores. Con "Libera desde" puedes dejar programado que un material se abra solo en una fecha. Con la columna "Plan" decides qué permiso lo libera: lo <b>Inicial</b> lo ven todas; lo <b>Avanzado</b> o <b>Completo</b> aparece con candado en las congregaciones con un permiso menor. En cada congregación puedes hacer excepciones.</p>
    <div class="row between"><div class="seg" role="group" aria-label="Tipo de material">${seg.map(([k, n]) => `<button aria-pressed="${ui.bib === k}" data-bib="${k}">${n}</button>`).join("")}</div>
    <button class="btn ghost sm" data-act="miniaturas">Crear miniaturas que faltan (${D.docs.filter((d) => d.comunidad_id === CENTRAL && ["cuentos", "materiales", "matprofes"].includes(d.col) && d.data.asset && !d.data.thumb).length})</button></div>
    <label class="drop" id="drop" for="files"><b>Arrastra aquí los archivos o toca para elegirlos</b><span class="muted small">${ui.bib === "cuentos" ? "PDF de hasta 25 MB. Si el nombre trae un número (\"N°12 - El arca de Noé.pdf\") se usa como número del cuento y se reemplaza si ya existe." : "PDF, imágenes o videos MP4 de hasta 25 MB. El nombre del archivo será el título; puedes editarlo después."}</span>
      <input type="file" id="files" multiple accept="${ui.bib === "cuentos" ? "application/pdf,.pdf" : ".pdf,.png,.jpg,.jpeg,.gif,.webp,.mp4"}" hidden></label>
    ${pg ? `<section class="card"><b>${pg.hecho < pg.total ? `${pg.txt || "Subiendo"} ${pg.hecho} de ${pg.total}…` : `Listo: ${pg.total - pg.errores.length} de ${pg.total} ${pg.txt ? "con miniatura" : "subidos"}`}</b><div class="prog"><i style="width:${(pg.hecho / pg.total) * 100}%"></i></div>${pg.errores.length ? `<p class="small" style="color:var(--rose)">${pg.errores.map(esc).join("<br>")}</p>` : ""}</section>` : ""}
    ${items.length ? `<div class="tbl"><table><thead><tr>${ui.bib === "cuentos" ? '<th class="num">N°</th>' : ""}<th></th><th>Título</th><th>Plan</th><th>Libera desde</th><th>Archivo</th><th>Subido</th><th></th></tr></thead><tbody>
    ${items.map((d) => `<tr>${ui.bib === "cuentos" ? `<td class="num"><input class="inp" style="width:64px;text-align:right" type="number" data-edit="numero" data-id="${esc(d.id)}" value="${esc(d.data.numero ?? "")}" aria-label="Número"></td>` : ""}
      <td>${d.data.thumb ? `<img class="thumb" src="${esc(blobUrl(d.data.thumb))}" alt="" loading="lazy">` : '<span class="thumb vacio">PDF</span>'}</td>
      <td><input class="inp" style="width:100%;min-width:200px" data-edit="titulo" data-id="${esc(d.id)}" value="${esc(d.data.titulo || "")}" aria-label="Título"></td>
      <td>${planSelect(`data-plan="${esc(d.id)}" aria-label="Plan que lo libera"`, d.data.plan)}${ui.bib === "cuentos" ? `<div><button class="link" data-preg="${esc(d.id)}">Preguntas (${(d.data.preguntas || []).length})</button></div>` : ""}</td>
      <td><input class="inp" type="date" data-libdesde="${esc(d.id)}" value="${esc(d.data.libera_desde || "")}" aria-label="Liberar desde"></td>
      <td class="small">${d.data.asset ? `<a href="${esc(blobUrl(d.data.asset))}" target="_blank" rel="noopener">${esc(d.data.archivo || "Abrir")}</a> <span class="muted">${fmtMB(d.data.tamano)}</span>` : (d.data.url ? `<a href="${esc(d.data.url)}" target="_blank" rel="noopener">Enlace</a>` : "–")}</td>
      <td class="small">${fmtFecha(d.actualizado)}</td><td><button class="btn danger sm" data-borrar="${esc(d.id)}" data-col="${esc(ui.bib)}" data-com="${CENTRAL}">Eliminar</button></td></tr>
      ${ui.preg === d.id ? `<tr><td colspan="9"><div class="preg-ed"><label for="pregTxt"><b>Preguntas para después de leer "${esc(d.data.titulo || "")}"</b></label>
        <textarea class="inp" id="pregTxt" rows="6" placeholder="¿Quién encontró a la ovejita? | Sara | Simón | Mateo">${esc((d.data.preguntas || []).map((q) => [q.p, q.ok, ...(q.malas || [])].join(" | ")).join("\n"))}</textarea>
        <p class="muted small">Una pregunta por línea: pregunta | respuesta correcta | respuestas incorrectas (hasta 3), separadas por |</p>
        <div class="row"><button class="btn sm" data-guardarpreg="${esc(d.id)}">Guardar preguntas</button><button class="btn ghost sm" data-preg="">Cerrar</button></div></div></td></tr>` : ""}`).join("")}
    </tbody></table></div><p class="muted small">Los cambios de número o título se guardan al salir de la casilla.</p>` : `<p class="empty">Aún no hay ${ui.bib === "cuentos" ? "cuentos" : "material"} en la biblioteca central.</p>`}`;
  }

  function vModeracion() {
    const docs = D.docs.filter((d) => d.comunidad_id !== CENTRAL && MODERABLES.includes(d.col) && (!ui.modCol || d.col === ui.modCol) && (!ui.modCom || d.comunidad_id === ui.modCom))
      .sort((a, b) => (a.actualizado < b.actualizado ? 1 : -1)).slice(0, 300);
    return `<div class="head"><div><p class="eyebrow">Súper administrador</p><h1>Moderación</h1></div>
    <div class="row"><select class="inp" id="modCol" aria-label="Tipo de contenido"><option value="">Todo el contenido</option>${MODERABLES.map((k) => `<option value="${k}" ${ui.modCol === k ? "selected" : ""}>${COLN[k]}</option>`).join("")}</select>
    <select class="inp" id="modCom" aria-label="Congregación"><option value="">Todas las congregaciones</option>${congregaciones().map((c) => `<option value="${esc(c.id)}" ${ui.modCom === c.id ? "selected" : ""}>${esc(c.nombre)}</option>`).join("")}</select></div></div>
    <p class="muted small">Lo más reciente primero. Eliminar borra el contenido y su archivo para todos; no se puede deshacer.</p>
    ${docs.length ? `<div class="tbl"><table><thead><tr><th>Contenido</th><th>Tipo</th><th>Congregación</th><th>Fecha</th><th></th></tr></thead><tbody>
    ${docs.map((d) => `<tr><td><b>${esc(resumenDoc(d))}</b>${d.data.texto && d.data.titulo ? `<div class="small muted">${esc(String(d.data.texto).slice(0, 140))}</div>` : ""}${d.data.asset ? `<div class="small"><a href="${esc(blobUrl(d.data.asset))}" target="_blank" rel="noopener">Ver archivo</a></div>` : ""}${(d.data.fotos || []).length ? `<div class="small">${d.data.fotos.map((f, i) => `<a href="${esc(blobUrl(f))}" target="_blank" rel="noopener">Foto ${i + 1}</a>`).join(" · ")}</div>` : ""}</td>
      <td><span class="pill">${esc(COLN[d.col] || d.col)}</span></td><td class="small">${esc(nombreCom(d.comunidad_id))}</td><td class="small">${fmtFechaHora(d.actualizado)}</td>
      <td><button class="btn danger sm" data-borrar="${esc(d.id)}" data-col="${esc(d.col)}" data-com="${esc(d.comunidad_id)}">Eliminar</button></td></tr>`).join("")}
    </tbody></table></div>` : `<p class="empty">No hay contenido con esos filtros.</p>`}`;
  }

  /* ---------- acciones ---------- */
  async function borrarDoc(cid, col, id) {
    const d = D.docs.find((x) => x.comunidad_id === cid && x.col === col && x.id === id);
    const { error } = await sb.from("docs").delete().eq("comunidad_id", cid).eq("col", col).eq("id", id);
    if (error) throw error;
    const files = [d && d.data.asset, d && d.data.thumb, ...((d && d.data.fotos) || [])].filter(Boolean);
    if (files.length) await sb.storage.from(BUCKET).remove(files);
    D.docs = D.docs.filter((x) => x !== d);
  }
  let PDFLIB = null;
  const cargarScript = (src) => new Promise((ok, mal) => { const t = document.createElement("script"); t.src = src; t.onload = ok; t.onerror = mal; document.head.appendChild(t); });
  async function pdfjs() { if (PDFLIB) return PDFLIB; const B = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/"; await cargarScript(B + "pdf.min.js"); await cargarScript(B + "pdf.worker.min.js"); PDFLIB = window.pdfjsLib; return PDFLIB; }
  async function miniatura(buf, ext) {
    try {
      if (buf instanceof Blob) buf = await buf.arrayBuffer();
      let c;
      if (ext === "pdf") { const lib = await pdfjs(); const doc = await lib.getDocument({ data: buf }).promise; const pg = await doc.getPage(1); const v0 = pg.getViewport({ scale: 1 }); const vp = pg.getViewport({ scale: 260 / v0.width });
        c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height); const cx = c.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, c.width, c.height); await pg.render({ canvasContext: cx, viewport: vp }).promise; }
      else if (/^(png|jpe?g|gif|webp)$/.test(ext)) { const bm = await createImageBitmap(new Blob([buf])); c = document.createElement("canvas"); c.width = 260; c.height = Math.round(bm.height * 260 / bm.width); c.getContext("2d").drawImage(bm, 0, 0, c.width, c.height); }
      else return null;
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.78)); if (!blob) return null;
      const path = CENTRAL + "/" + crypto.randomUUID() + ".jpg";
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
      return error ? null : path;
    } catch (e) { console.warn("miniatura", e); return null; }
  }
  async function crearMiniaturas() {
    const faltan = D.docs.filter((d) => d.comunidad_id === CENTRAL && ["cuentos", "materiales", "matprofes"].includes(d.col) && d.data.asset && !d.data.thumb);
    if (!faltan.length) { toast("Todo el material ya tiene miniatura"); return; }
    ui.subida = { hecho: 0, total: faltan.length, errores: [], txt: "Creando miniaturas" }; render();
    for (const d of faltan) {
      try {
        const r = await fetch(blobUrl(d.data.asset)); if (!r.ok) throw new Error("no se pudo leer el archivo");
        const thumb = await miniatura(await r.arrayBuffer(), (d.data.asset.split(".").pop() || "").toLowerCase());
        if (thumb) { const data = { ...d.data, thumb }; const { error } = await sb.from("docs").update({ data }).eq("comunidad_id", CENTRAL).eq("col", d.col).eq("id", d.id); if (error) throw error; d.data = data; }
      } catch (e) { ui.subida.errores.push((d.data.titulo || d.id) + ": " + (e.message || e)); }
      ui.subida.hecho++; render();
    }
  }
  const TIPOS = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", mp4: "video/mp4" };
  async function subir(files) {
    files = [...files].filter((f) => TIPOS[(f.name.split(".").pop() || "").toLowerCase()] && (ui.bib !== "cuentos" || /\.pdf$/i.test(f.name)));
    if (!files.length) { toast("Elige archivos " + (ui.bib === "cuentos" ? "PDF" : "PDF, imagen o MP4")); return; }
    ui.subida = { hecho: 0, total: files.length, errores: [] }; render();
    for (const f of files) {
      try {
        if (f.size > 25 * 1024 * 1024) throw new Error("pesa más de 25 MB");
        const ext = f.name.split(".").pop().toLowerCase(); const path = CENTRAL + "/" + crypto.randomUUID() + "." + ext;
        const { error: e1 } = await sb.storage.from(BUCKET).upload(path, f, { contentType: TIPOS[ext], cacheControl: "31536000" });
        if (e1) throw e1;
        const thumb = await miniatura(f, ext);
        const base = f.name.replace(/\.[^.]+$/, "");
        let id, data;
        if (ui.bib === "cuentos") {
          const m = base.match(/\d+/); const num = m ? parseInt(m[0], 10) : (Math.max(0, ...docsDe(CENTRAL, "cuentos").map((d) => d.data.numero || 0)) + 1);
          const titulo = base.replace(/^\s*(cuento)?\s*(n[°ºo.]*)?\s*[-_#]*\s*\d+\s*[-_.:)]*\s*/i, "").replace(/_+/g, " ").trim() || base;
          id = "cuento-" + String(num).padStart(3, "0");
          const prev = D.docs.find((d) => d.comunidad_id === CENTRAL && d.col === "cuentos" && d.id === id);
          data = { ...(prev ? prev.data : {}), numero: num, titulo: prev && prev.data.titulo ? prev.data.titulo : titulo, asset: path, thumb, archivo: f.name, tamano: f.size, subido: new Date().toISOString().slice(0, 10) };
          const viejos = prev ? [prev.data.asset, prev.data.thumb].filter(Boolean) : []; if (viejos.length) await sb.storage.from(BUCKET).remove(viejos);
        } else {
          id = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
          data = { titulo: base.replace(/[_-]+/g, " ").trim(), asset: path, thumb, archivo: f.name, tamano: f.size, fecha: new Date().toISOString().slice(0, 10) };
        }
        const { error: e2 } = await sb.from("docs").upsert({ comunidad_id: CENTRAL, col: ui.bib, id, data, actualizado: new Date().toISOString() });
        if (e2) throw e2;
        D.docs = D.docs.filter((d) => !(d.comunidad_id === CENTRAL && d.col === ui.bib && d.id === id));
        D.docs.push({ comunidad_id: CENTRAL, col: ui.bib, id, data, actualizado: new Date().toISOString() });
      } catch (e) { ui.subida.errores.push(f.name + ": " + (e.message || e)); }
      ui.subida.hecho++; render();
    }
  }
  function csv() {
    const rows = [["Nombre", "Correo", "Congregaciones", "Registro", "Último ingreso", "Estado"]].concat(D.usuarios.map((u) => [u.nombre || "", u.email || "", (u.comunidades || []).map((c) => c.nombre + " (" + (ROLN[c.rol] || c.rol) + ")").join("; "), fmtFecha(u.creado), fmtFechaHora(u.ultimo_ingreso), u.suspendido ? "Suspendido" : "Activo"]));
    const txt = "﻿" + rows.map((r) => r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(";")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" }));
    a.download = "usuarios-eterno-pacto-kids-" + new Date().toISOString().slice(0, 10) + ".csv"; document.body.appendChild(a); a.click(); a.remove();
  }

  document.addEventListener("click", async (e) => {
    const b = e.target.closest("button,tr[data-com]"); if (!b) return;
    try {
      if (b.dataset.tab) { ui.tab = b.dataset.tab; ui.com = null; ui.buscar = ""; render(); window.scrollTo(0, 0); return; }
      if (b.dataset.com && b.tagName === "TR") { ui.com = b.dataset.com; render(); window.scrollTo(0, 0); return; }
      if (b.dataset.bib) { ui.bib = b.dataset.bib; ui.subida = null; render(); return; }
      if (b.dataset.preg !== undefined) { ui.preg = b.dataset.preg || null; render(); return; }
      if (b.dataset.guardarpreg) {
        const d = D.docs.find((x) => x.comunidad_id === CENTRAL && x.col === "cuentos" && x.id === b.dataset.guardarpreg); if (!d) return;
        const preguntas = $("#pregTxt").value.split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((a) => a.length >= 3 && a[0] && a[1]).map((a) => ({ p: a[0].slice(0, 200), ok: a[1].slice(0, 100), malas: a.slice(2).filter(Boolean).slice(0, 3).map((x) => x.slice(0, 100)) }));
        const data = { ...d.data, preguntas };
        const { error } = await sb.from("docs").update({ data, actualizado: new Date().toISOString() }).eq("comunidad_id", CENTRAL).eq("col", "cuentos").eq("id", d.id); if (error) throw error;
        d.data = data; ui.preg = null; toast(preguntas.length + " preguntas guardadas"); render(); return;
      }
      if (b.dataset.sol) {
        const x = D.solicitudes.find((y) => y.id === b.dataset.sol); if (!x) return;
        if (b.dataset.v === "aprobar") { const { error } = await sb.from("excepciones").upsert({ comunidad_id: x.comunidad_id, col: x.col, doc_id: x.doc_id, liberado: true, desde: null }); if (error) throw error;
          D.excepciones = D.excepciones.filter((e) => !(e.comunidad_id === x.comunidad_id && e.col === x.col && e.doc_id === x.doc_id)).concat([{ comunidad_id: x.comunidad_id, col: x.col, doc_id: x.doc_id, liberado: true }]); }
        const estado = b.dataset.v === "aprobar" ? "aprobada" : "rechazada";
        const { error } = await sb.from("solicitudes").update({ estado, respondido: new Date().toISOString() }).eq("id", x.id); if (error) throw error;
        x.estado = estado; toast(estado === "aprobada" ? "Material liberado para " + nombreCom(x.comunidad_id) : "Solicitud rechazada"); render(); return;
      }
      if (b.dataset.matcol) { ui.matCol = b.dataset.matcol; render(); return; }
      if (b.dataset.borrarforo) {
        if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "¿Eliminar con sus temas?"; return; }
        const { error } = await sb.from("foros").delete().eq("id", b.dataset.borrarforo); if (error) throw error;
        D.foros = D.foros.filter((f) => f.id !== b.dataset.borrarforo && f.padre_id !== b.dataset.borrarforo); toast("Foro eliminado"); render(); return;
      }
      if (b.dataset.msg) {
        const id = b.dataset.msg, v = b.dataset.v;
        if (v === "borrar") { if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "¿Seguro?"; return; } const { error } = await sb.from("mensajes").delete().eq("id", id); if (error) throw error; }
        else { const { error } = await sb.from("mensajes").update({ estado: v, reportes: 0 }).eq("id", id); if (error) throw error; }
        D.mensajes = D.mensajes.filter((m) => m.id !== id); toast(v === "publicado" ? "Mensaje aprobado" : v === "oculto" ? "Mensaje ocultado" : "Mensaje eliminado"); render(); return;
      }
      const act = b.dataset.act;
      if (act === "volverCom") { ui.com = null; render(); return; }
      if (act === "moderarCom") { ui.tab = "moderacion"; ui.modCom = b.dataset.id; ui.com = null; render(); return; }
      if (act === "csv") { csv(); return; }
      if (act === "miniaturas") { crearMiniaturas(); return; }
      if (act === "verCom") { ui.tab = "congregaciones"; ui.com = b.dataset.id; render(); window.scrollTo(0, 0); return; }
      if (b.dataset.quitar) {
        if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "¿Seguro?"; return; }
        const { error } = await sb.rpc("quitar_miembro", { p_comunidad: ui.com, p_user: b.dataset.quitar }); if (error) throw error;
        D.miembros = D.miembros.filter((m) => !(m.comunidad_id === ui.com && m.user_id === b.dataset.quitar)); toast("Miembro quitado"); render(); return;
      }
      if (b.dataset.susp) {
        if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = b.dataset.v === "1" ? "¿Suspender?" : "¿Reactivar?"; return; }
        const v = b.dataset.v === "1"; const { error } = await sb.rpc("super_suspender", { p_user: b.dataset.susp, p_valor: v }); if (error) throw error;
        const u = usuario(b.dataset.susp); if (u) u.suspendido = v; toast(v ? "Cuenta suspendida" : "Cuenta reactivada"); render(); return;
      }
      if (b.dataset.borrar) {
        if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "¿Eliminar?"; return; }
        b.disabled = true; await borrarDoc(b.dataset.com, b.dataset.col, b.dataset.borrar); toast("Eliminado"); render(); return;
      }
    } catch (x) { err(x); }
  });
  document.addEventListener("keydown", (e) => { const t = e.target; if (e.key === "Enter" && t.matches && t.matches("tr[data-com]")) t.click(); });
  document.addEventListener("input", (e) => {
    if (e.target.id === "buscar") { ui.buscar = e.target.value; const pos = e.target.selectionStart; render(); const n = $("#buscar"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
  });
  document.addEventListener("change", async (e) => {
    const t = e.target;
    try {
      if (t.id === "files") { const fs = [...t.files]; t.value = ""; subir(fs); return; }
      if (t.id === "foroCom") { ui.foroCom = t.value; render(); return; }
      if (t.dataset.vence) {
        const { error } = await sb.rpc("super_set_vence", { p_comunidad: t.dataset.vence, p_hasta: t.value || null }); if (error) throw error;
        D.comunidades.find((c) => c.id === t.dataset.vence).plan_hasta = t.value || null; toast(t.value ? "Vencimiento guardado" : "Sin vencimiento"); render(); return;
      }
      if (t.dataset.libdesde) {
        const d = D.docs.find((x) => x.comunidad_id === CENTRAL && x.col === ui.bib && x.id === t.dataset.libdesde); if (!d) return;
        const data = { ...d.data }; if (t.value) data.libera_desde = t.value; else delete data.libera_desde;
        const { error } = await sb.from("docs").update({ data, actualizado: new Date().toISOString() }).eq("comunidad_id", CENTRAL).eq("col", ui.bib).eq("id", d.id); if (error) throw error;
        d.data = data; toast(t.value ? "Se liberará el " + t.value.split("-").reverse().join("-") : "Sin fecha de liberación"); return;
      }
      if (t.dataset.excdesde) {
        const e = excepcion(ui.com, t.dataset.col, t.dataset.excdesde); if (!e) return;
        const { error } = await sb.from("excepciones").update({ desde: t.value || null }).match({ comunidad_id: ui.com, col: t.dataset.col, doc_id: t.dataset.excdesde }); if (error) throw error;
        e.desde = t.value || null; toast("Fecha guardada"); render(); return;
      }
      if (t.dataset.plancom) {
        const { error } = await sb.rpc("super_set_plan", { p_comunidad: t.dataset.plancom, p_plan: t.value }); if (error) throw error;
        D.comunidades.find((c) => c.id === t.dataset.plancom).plan_id = t.value; toast("Permiso actualizado: " + planNombre(t.value)); render(); return;
      }
      if (t.dataset.plann) {
        const v = t.value.trim(); if (t.dataset.k === "nombre" && v.length < 2) { toast("Escribe un nombre"); render(); return; }
        const { error } = await sb.from("planes").update({ [t.dataset.k]: v || null }).eq("id", t.dataset.plann); if (error) throw error;
        const pl = D.planes.find((x) => x.id === t.dataset.plann); if (pl) pl[t.dataset.k] = v; toast("Guardado"); return;
      }
      if (t.id === "planCom") {
        const { error } = await sb.rpc("super_set_plan", { p_comunidad: ui.com, p_plan: t.value }); if (error) throw error;
        D.comunidades.find((c) => c.id === ui.com).plan_id = t.value; toast("Plan actualizado a " + planNombre(t.value)); render(); return;
      }
      if (t.dataset.exc) {
        const k = { comunidad_id: ui.com, col: t.dataset.col, doc_id: t.dataset.exc };
        if (t.value === "") { const { error } = await sb.from("excepciones").delete().match(k); if (error) throw error; D.excepciones = D.excepciones.filter((e) => !(e.comunidad_id === k.comunidad_id && e.col === k.col && e.doc_id === k.doc_id)); }
        else { const row = { ...k, liberado: t.value === "1" }; const { error } = await sb.from("excepciones").upsert(row); if (error) throw error; D.excepciones = D.excepciones.filter((e) => !(e.comunidad_id === k.comunidad_id && e.col === k.col && e.doc_id === k.doc_id)).concat([row]); }
        toast("Acceso actualizado"); render(); return;
      }
      if (t.dataset.plan) {
        const d = D.docs.find((x) => x.comunidad_id === CENTRAL && x.col === ui.bib && x.id === t.dataset.plan); if (!d) return;
        const data = { ...d.data, plan: t.value };
        const { error } = await sb.from("docs").update({ data, actualizado: new Date().toISOString() }).eq("comunidad_id", CENTRAL).eq("col", ui.bib).eq("id", d.id);
        if (error) throw error; d.data = data; toast("Plan del material: " + planNombre(t.value)); return;
      }
      if (t.dataset.foro) {
        const v = t.dataset.k === "ninos" ? t.value === "true" : t.value;
        const { error } = await sb.from("foros").update({ [t.dataset.k]: v }).eq("id", t.dataset.foro); if (error) throw error;
        const f = D.foros.find((x) => x.id === t.dataset.foro); if (f) f[t.dataset.k] = v; toast("Foro actualizado"); return;
      }
      if (t.id === "modCol") { ui.modCol = t.value; render(); return; }
      if (t.id === "modCom") { ui.modCom = t.value; render(); return; }
      if (t.dataset.rol) {
        const { error } = await sb.rpc("cambiar_rol", { p_comunidad: ui.com, p_user: t.dataset.rol, p_rol: t.value });
        if (error) { err(error); render(); return; }
        const m = D.miembros.find((x) => x.comunidad_id === ui.com && x.user_id === t.dataset.rol); if (m) m.rol = t.value; toast("Rol actualizado"); return;
      }
      if (t.dataset.edit) {
        const d = D.docs.find((x) => x.comunidad_id === CENTRAL && x.col === ui.bib && x.id === t.dataset.id); if (!d) return;
        const data = { ...d.data, [t.dataset.edit]: t.dataset.edit === "numero" ? Number(t.value) : t.value.trim() };
        const { error } = await sb.from("docs").update({ data, actualizado: new Date().toISOString() }).eq("comunidad_id", CENTRAL).eq("col", ui.bib).eq("id", d.id);
        if (error) throw error; d.data = data; toast("Guardado"); return;
      }
    } catch (x) { err(x); }
  });
  document.addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target;
    try {
      if (f.id === "fCom") {
        const upd = { nombre: $("#cNom").value.trim(), ciudad: $("#cCiu").value.trim() || null, region: $("#cReg").value.trim() || null, pais: $("#cPai").value.trim() || null };
        if (upd.nombre.length < 2) return toast("Escribe el nombre de la congregación");
        const { error } = await sb.from("comunidades").update(upd).eq("id", ui.com); if (error) throw error;
        Object.assign(D.comunidades.find((c) => c.id === ui.com), upd); toast("Datos guardados"); render(); return;
      }
      if (f.id === "fForo") {
        const nombre = $("#foroNom").value.trim(); if (nombre.length < 2) return toast("Escribe el nombre del foro");
        const padre = $("#foroPadre").value || null; const pf = padre && D.foros.find((x) => x.id === padre);
        const row = { comunidad_id: ui.foroCom || null, padre_id: padre, nombre, lectura: pf ? pf.lectura : (ui.foroCom ? "miembros" : "todos"), escritura: pf ? pf.escritura : (ui.foroCom ? "miembros" : "todos"), ninos: pf ? pf.ninos : false, orden: D.foros.length + 1 };
        const { data, error } = await sb.from("foros").insert(row).select().single(); if (error) throw error;
        D.foros.push(data); toast("Foro creado"); render(); return;
      }
      if (f.id === "fAdd") {
        const email = $("#addEmail").value.trim().toLowerCase(); const u = D.usuarios.find((x) => (x.email || "").toLowerCase() === email);
        if (!u) return toast("No hay un usuario registrado con ese correo");
        const rol = $("#addRol").value; const { error } = await sb.rpc("super_agregar_miembro", { p_comunidad: ui.com, p_user: u.user_id, p_rol: rol }); if (error) throw error;
        D.miembros = D.miembros.filter((m) => !(m.comunidad_id === ui.com && m.user_id === u.user_id)); D.miembros.push({ comunidad_id: ui.com, user_id: u.user_id, rol, creado: new Date().toISOString() });
        toast("Miembro agregado"); render(); return;
      }
      if (f.id === "fDel") {
        const c = D.comunidades.find((x) => x.id === ui.com);
        if ($("#delNom").value.trim() !== c.nombre) return toast("El nombre no coincide");
        const archivos = docsDe(c.id).flatMap((d) => [d.data.asset, ...(d.data.fotos || [])]).filter(Boolean);
        const { error } = await sb.from("comunidades").delete().eq("id", c.id); if (error) throw error;
        if (archivos.length) await sb.storage.from(BUCKET).remove(archivos);
        D.comunidades = D.comunidades.filter((x) => x.id !== c.id); D.docs = D.docs.filter((d) => d.comunidad_id !== c.id); D.miembros = D.miembros.filter((m) => m.comunidad_id !== c.id);
        ui.com = null; toast("Congregación eliminada"); render(); return;
      }
    } catch (x) { err(x); }
  });
  ["dragover", "dragenter"].forEach((ev) => document.addEventListener(ev, (e) => { const d = e.target.closest && e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.add("over"); } }));
  document.addEventListener("dragleave", (e) => { const d = e.target.closest && e.target.closest("#drop"); if (d) d.classList.remove("over"); });
  document.addEventListener("drop", (e) => { const d = e.target.closest && e.target.closest("#drop"); if (!d) return; e.preventDefault(); d.classList.remove("over"); subir(e.dataTransfer.files); });
  $("#recargar").addEventListener("click", cargar);
  $("#salir").addEventListener("click", async () => { await sb.auth.signOut(); location.href = "/"; });
  iniciar();
})();
