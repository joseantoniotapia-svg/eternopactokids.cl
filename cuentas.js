/* Eterno Pacto Kids · cuentas, congregaciones y conexión con Supabase */
(function () {
  "use strict";
  const SB_URL = "https://izkqplqwxoszwqpzxwrb.supabase.co";
  const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6a3FwbHF3eG9zendxcHp4d3JiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MDU2MjMsImV4cCI6MjExMDA4MTYyM30.o9TizvJI1wvRRMRh-FfUDnw4bP8PT8m_jzQBath49YY";
  const BUCKET = "archivos";
  const CENTRAL = "00000000-0000-0000-0000-000000000001";
  const CON_CENTRAL = ["cuentos", "materiales", "matprofes", "biblicos"];
  const sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CTX = { user: null, comunidad: null, rol: null, comunidades: [], super: false };
  const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };

  /* ---------- utilidades públicas ---------- */
  window.blobUrl = (id) => SB_URL + "/storage/v1/object/public/" + BUCKET + "/" + String(id || "").split("/").map(encodeURIComponent).join("/");
  const equipo = () => CTX.rol === "admin" || CTX.rol === "maestro";
  const traducirError = (e) => {
    const m = String((e && (e.message || e.error_description)) || e || "");
    if (/invalid login credentials/i.test(m)) return "Correo o contraseña incorrectos.";
    if (/email not confirmed/i.test(m)) return "Falta confirmar tu correo. Revisa tu bandeja de entrada (y la carpeta de spam).";
    if (/already registered|already exists/i.test(m)) return "Ese correo ya tiene una cuenta. Ingresa con tu contraseña.";
    if (/password should be at least|weak password/i.test(m)) return "La contraseña debe tener al menos 8 caracteres.";
    if (/rate limit|too many/i.test(m)) return "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.";
    if (/código no encontrado/i.test(m)) return "No encontramos ese código. Revísalo con tu maestro o administrador.";
    if (/failed to fetch|network/i.test(m)) return "No hay conexión. Revisa tu internet e inténtalo otra vez.";
    return m || "Algo salió mal. Inténtalo otra vez.";
  };

  /* ---------- base de datos con la forma que usa la app ---------- */
  function crearDB(cid) {
    const cache = {}, subs = {}, cargando = {}, timers = {};
    const emitir = (col) => {
      const docs = (cache[col] || []).map((r) => ({ id: r.id, exists: true, data: () => r.data }));
      (subs[col] || []).forEach((f) => { try { f({ docs }); } catch (e) { console.error(e); } });
    };
    const cargar = async (col) => {
      if (cargando[col]) return cargando[col];
      cargando[col] = (async () => {
        const ids = CON_CENTRAL.includes(col) ? [cid, CENTRAL] : [cid];
        const { data, error } = await sb.from("docs").select("comunidad_id,id,data").in("comunidad_id", ids).eq("col", col).limit(5000);
        cargando[col] = null;
        if (error) throw error;
        cache[col] = (data || []).map((r) => r.comunidad_id === CENTRAL ? { id: "c_" + r.id, data: { ...r.data, _central: true } } : { id: r.id, data: r.data });
        emitir(col);
      })();
      return cargando[col];
    };
    const recargar = (col) => { clearTimeout(timers[col]); timers[col] = setTimeout(() => { if (subs[col]) cargar(col).catch(() => {}); }, 400); };
    sb.channel("docs-" + cid)
      .on("postgres_changes", { event: "*", schema: "public", table: "docs" }, (p) => {
        const r = (p.new && p.new.col) ? p.new : p.old;
        if (!r || (r.comunidad_id && r.comunidad_id !== cid && r.comunidad_id !== CENTRAL)) return;
        if (r.col) recargar(r.col);
      })
      .subscribe();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) Object.keys(subs).forEach(recargar); });
    const errDB = (error) => { const e = new Error(error.message); e.code = (error.code === "42501" || /row-level security/i.test(error.message)) ? "invalid_argument" : "unknown"; return e; };
    const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/-/g, "").slice(0, 20);
    const ref = (col, id) => ({
      id, path: col + "/" + id,
      async set(data) {
        const { error } = await sb.from("docs").upsert({ comunidad_id: cid, col, id, data, actualizado: new Date().toISOString() });
        if (error) throw errDB(error);
        const arr = cache[col] || (cache[col] = []); const i = arr.findIndex((x) => x.id === id);
        if (i >= 0) arr[i] = { id, data }; else arr.push({ id, data }); emitir(col);
      },
      async delete() {
        const { error } = await sb.from("docs").delete().eq("comunidad_id", cid).eq("col", col).eq("id", id);
        if (error) throw errDB(error);
        cache[col] = (cache[col] || []).filter((x) => x.id !== id); emitir(col);
      },
      onSnapshot(next, err) {
        return api.collection(col).onSnapshot((snap) => {
          const d = snap.docs.find((x) => x.id === id);
          next({ id, exists: !!d, data: () => (d ? d.data() : undefined) });
        }, err);
      }
    });
    const api = {
      collection(col) {
        return {
          doc: (id) => ref(col, id || nuevoId()),
          onSnapshot(next, err) {
            (subs[col] = subs[col] || []).push(next);
            if (cache[col]) setTimeout(() => emitir(col), 0); else cargar(col).catch((e) => err && err(e));
            return () => { subs[col] = (subs[col] || []).filter((f) => f !== next); };
          }
        };
      },
      doc(path) { const [col, id] = String(path).split("/"); return ref(col, id); }
    };
    return api;
  }

  const TIPOS_EXT = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm", "text/plain": "txt", "text/csv": "csv" };
  function crearAssets(cid) {
    return {
      async upload(blob, opts) {
        const type = (opts && opts.type) || blob.type;
        const ext = TIPOS_EXT[type]; if (!ext) throw { code: "unsupported_type" };
        if (blob.size > 25 * 1024 * 1024) throw { code: "too_large" };
        const id = cid + "/" + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2)) + "." + ext;
        const { error } = await sb.storage.from(BUCKET).upload(id, blob, { contentType: type, upsert: false, cacheControl: "31536000" });
        if (error) {
          const m = String(error.message || "");
          if (/size|too large|maximum/i.test(m)) throw { code: "too_large" };
          if (/mime|type/i.test(m)) throw { code: "unsupported_type" };
          if (/row-level security|unauthorized|403/i.test(m)) throw { code: "not_granted" };
          if (/quota|limit/i.test(m)) throw { code: "quota_or_state" };
          throw { code: "store_unavailable", message: m };
        }
        return { id, sizeBytes: blob.size, contentType: type, url: window.blobUrl(id) };
      },
      async list() {
        const { data, error } = await sb.storage.from(BUCKET).list(cid, { limit: 1000 });
        if (error) throw error;
        const files = (data || []).filter((f) => f.id);
        const bytes = files.reduce((a, f) => a + ((f.metadata && f.metadata.size) || 0), 0);
        return { assets: [], usage: { bytes, files: files.length, maxBytes: 1024 * 1024 * 1024, maxFiles: 1000 } };
      },
      async delete(id) { const { error } = await sb.storage.from(BUCKET).remove([id]); if (error) throw error; return {}; }
    };
  }
  const downloads = {
    async save({ filename, data }) {
      const u = URL.createObjectURL(data); const a = document.createElement("a");
      a.href = u; a.download = filename || "archivo"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000); return {};
    }
  };

  /* ---------- familia (perfiles, avance e insignias) en la cuenta ---------- */
  let famTimer = null;
  window.EPK = {
    get user() { return CTX.user; }, get comunidad() { return CTX.comunidad; }, get rol() { return CTX.rol; },
    async cargarFamilia() {
      const { data, error } = await sb.from("familias").select("data").eq("user_id", CTX.user.id).maybeSingle();
      if (error) return null; return data ? data.data : null;
    },
    guardarFamilia(obj) {
      clearTimeout(famTimer);
      famTimer = setTimeout(async () => {
        const { error } = await sb.from("familias").upsert({ user_id: CTX.user.id, data: obj, actualizado: new Date().toISOString() });
        if (error) console.warn("familia", error.message);
      }, 1200);
    },
    abrirMenu: () => abrirMenu()
  };

  /* runtime con la misma forma que la versión anterior de la app */
  window.claude = {
    use: async (name) => {
      if (!CTX.comunidad) return null;
      if (name === "db") return crearDB(CTX.comunidad.id);
      if (name === "user") return { canEdit: async () => equipo(), can: async () => equipo(), isOwner: () => CTX.rol === "admin" };
      if (name === "assets") return equipo() ? crearAssets(CTX.comunidad.id) : null;
      if (name === "downloads") return downloads;
      return null;
    }
  };

  /* ---------- pantallas de acceso ---------- */
  const root = () => $("#acceso");
  const params = new URLSearchParams(location.search);
  const codigoInvitacion = (params.get("c") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  if (codigoInvitacion) LS.set("epk_invitacion", codigoInvitacion);

  function marco(contenido) {
    root().hidden = false;
    root().innerHTML = `<div class="ac-wrap"><div class="ac-head"><img src="img/logo.jpg" alt="Eterno Pacto Kids" width="120" height="71"><div class="ac-pers">${["sara", "simon", "santiago", "maria", "mateo"].map((k) => `<img src="img/${k}.jpg" alt="" width="52" height="52">`).join("")}</div></div><div class="ac-card">${contenido}</div>
    <p class="ac-legal"><a href="privacidad.html">Privacidad</a> · <a href="terminos.html">Términos</a></p></div>`;
  }
  const msg = (t, ok) => { const el = $("#acMsg"); if (el) { el.textContent = t || ""; el.className = "ac-msg" + (ok ? " ok" : ""); el.hidden = !t; } };
  const ocupado = (form, si, txt) => { const b = form.querySelector('button[type="submit"]'); if (!b) return; b.disabled = si; if (txt) b.textContent = txt; };

  function pantallaIngreso(modo) {
    modo = modo || (LS.get("epk_invitacion") ? "registro" : "ingreso");
    if (modo === "registro") {
      marco(`<h1>Crea tu cuenta</h1><p class="ac-sub">Una cuenta por familia. Dentro podrás crear un perfil para cada integrante: papá, mamá, abuelos e hijos.</p>
      <form id="acForm" novalidate>
        <label for="acNombre">Tu nombre</label><input id="acNombre" autocomplete="name" required placeholder="José Tapia">
        <label for="acEmail">Correo</label><input id="acEmail" type="email" autocomplete="email" required>
        <label for="acPass">Contraseña</label><input id="acPass" type="password" autocomplete="new-password" minlength="8" required placeholder="Mínimo 8 caracteres">
        <label class="ac-check" for="acAcepto"><input type="checkbox" id="acAcepto"> <span>Soy mayor de 18 años, soy el adulto responsable de los niños que agregue y acepto los <a href="terminos.html" target="_blank">Términos</a> y la <a href="privacidad.html" target="_blank">Política de privacidad</a>.</span></label>
        <p id="acMsg" class="ac-msg" hidden></p>
        <button type="submit" class="ac-btn">Crear cuenta</button>
      </form><p class="ac-alt">¿Ya tienes cuenta? <button class="ac-link" data-ir="ingreso">Ingresar</button></p>`);
      $("#acForm").addEventListener("submit", async (e) => {
        e.preventDefault(); const f = e.target;
        const nombre = $("#acNombre").value.trim(), email = $("#acEmail").value.trim(), pass = $("#acPass").value;
        if (!nombre || !email) return msg("Completa tu nombre y tu correo.");
        if (pass.length < 8) return msg("La contraseña debe tener al menos 8 caracteres.");
        if (!$("#acAcepto").checked) return msg("Para continuar debes aceptar los términos y confirmar que eres mayor de 18 años.");
        ocupado(f, true, "Creando…");
        const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { nombre, acepto: "si" }, emailRedirectTo: location.origin + location.pathname } });
        if (error) { ocupado(f, false, "Crear cuenta"); return msg(traducirError(error)); }
        if (!data.session) { marco(`<h1>Revisa tu correo</h1><p class="ac-sub">Te enviamos un enlace a <b>${esc(email)}</b> para confirmar tu cuenta. Ábrelo desde este mismo dispositivo. Si no aparece, revisa la carpeta de spam.</p><button class="ac-btn" data-ir="ingreso">Ya lo confirmé, ingresar</button>`); }
      });
    } else if (modo === "olvido") {
      marco(`<h1>Recuperar contraseña</h1><p class="ac-sub">Te enviaremos un enlace para crear una contraseña nueva.</p>
      <form id="acForm" novalidate><label for="acEmail">Correo</label><input id="acEmail" type="email" autocomplete="email" required>
      <p id="acMsg" class="ac-msg" hidden></p><button type="submit" class="ac-btn">Enviar enlace</button></form>
      <p class="ac-alt"><button class="ac-link" data-ir="ingreso">Volver</button></p>`);
      $("#acForm").addEventListener("submit", async (e) => {
        e.preventDefault(); const f = e.target; ocupado(f, true, "Enviando…");
        const { error } = await sb.auth.resetPasswordForEmail($("#acEmail").value.trim(), { redirectTo: location.origin + location.pathname });
        ocupado(f, false, "Enviar enlace");
        if (error) return msg(traducirError(error));
        msg("Listo. Si el correo tiene una cuenta, te llegará el enlace en unos minutos.", true);
      });
    } else {
      marco(`<h1>Bienvenidos</h1><p class="ac-sub">La escuela dominical en casa: clases, cuentos, la Biblia y las insignias de cada niño.</p>
      <form id="acForm" novalidate><label for="acEmail">Correo</label><input id="acEmail" type="email" autocomplete="email" required>
      <label for="acPass">Contraseña</label><input id="acPass" type="password" autocomplete="current-password" required>
      <p id="acMsg" class="ac-msg" hidden></p><button type="submit" class="ac-btn">Ingresar</button></form>
      <p class="ac-alt"><button class="ac-link" data-ir="olvido">Olvidé mi contraseña</button></p>
      <p class="ac-alt">¿Primera vez? <button class="ac-link" data-ir="registro">Crear una cuenta</button></p>`);
      $("#acForm").addEventListener("submit", async (e) => {
        e.preventDefault(); const f = e.target; ocupado(f, true, "Ingresando…");
        const { error } = await sb.auth.signInWithPassword({ email: $("#acEmail").value.trim(), password: $("#acPass").value });
        if (error) { ocupado(f, false, "Ingresar"); msg(traducirError(error)); }
      });
    }
    (root().querySelector("input") || {}).focus?.();
  }

  function pantallaNuevaClave() {
    marco(`<h1>Nueva contraseña</h1><form id="acForm" novalidate><label for="acPass">Contraseña nueva</label><input id="acPass" type="password" autocomplete="new-password" minlength="8" required>
    <p id="acMsg" class="ac-msg" hidden></p><button type="submit" class="ac-btn">Guardar contraseña</button></form>`);
    $("#acForm").addEventListener("submit", async (e) => {
      e.preventDefault(); const p = $("#acPass").value; if (p.length < 8) return msg("La contraseña debe tener al menos 8 caracteres.");
      const { error } = await sb.auth.updateUser({ password: p }); if (error) return msg(traducirError(error));
      msg("Contraseña guardada.", true); setTimeout(() => location.replace(location.pathname), 900);
    });
  }

  async function misComunidades() {
    const { data, error } = await sb.from("miembros").select("rol, comunidades(id,nombre,codigo)").eq("user_id", CTX.user.id);
    if (error) throw error;
    const lista = (data || []).filter((m) => m.comunidades && m.comunidades.id !== CENTRAL).map((m) => ({ ...m.comunidades, rol: m.rol }));
    if (CTX.super) {
      const { data: todas } = await sb.from("comunidades").select("id,nombre,codigo").neq("id", CENTRAL).order("nombre");
      (todas || []).forEach((c) => { const x = lista.find((l) => l.id === c.id); if (x) x.rol = "admin"; else lista.push({ ...c, rol: "admin", externa: true }); });
    }
    return lista;
  }

  function pantallaComunidad(lista) {
    const inv = LS.get("epk_invitacion") || "";
    marco(`<h1>Tu congregación</h1>
    ${lista.length ? `<p class="ac-sub">Elige con cuál quieres entrar.</p><div class="ac-lista">${lista.map((c) => `<button class="ac-com" data-com="${esc(c.id)}"><b>${esc(c.nombre)}</b><span>${c.externa ? "Súper admin" : { admin: "Administrador", maestro: "Maestro", familia: "Familia" }[c.rol]}</span></button>`).join("")}${CTX.super ? `<a class="ac-com" href="panel.html"><b>Panel de Control</b><span>Súper admin</span></a>` : ""}</div><hr>` : `<p class="ac-sub">Para empezar, únete a tu congregación con el código que te dio tu maestro.</p>`}
    <form id="acUnir" novalidate><label for="acCodigo">Código de invitación</label><input id="acCodigo" autocomplete="off" autocapitalize="characters" maxlength="8" value="${esc(inv)}" placeholder="Ej: 1B9D00">
    <p id="acMsg" class="ac-msg" hidden></p><button type="submit" class="ac-btn">Unirme</button></form>
    <details class="ac-det"><summary>Soy pastor o maestro y quiero crear mi congregación</summary>
    <form id="acCrear" novalidate><label for="acNombreCom">Nombre de la congregación</label><input id="acNombreCom" maxlength="80" placeholder="Iglesia Eterno Pacto">
    <label for="acCiudad">Ciudad o comuna</label><input id="acCiudad" maxlength="60" placeholder="Paine">
    <label for="acRegion">Región</label><input id="acRegion" maxlength="60" list="acRegiones" placeholder="Metropolitana"><datalist id="acRegiones">${["Arica y Parinacota","Tarapacá","Antofagasta","Atacama","Coquimbo","Valparaíso","Metropolitana","O'Higgins","Maule","Ñuble","Biobío","La Araucanía","Los Ríos","Los Lagos","Aysén","Magallanes"].map((r) => `<option value="${esc(r)}">`).join("")}</datalist>
    <label for="acPais">País</label><input id="acPais" maxlength="60" value="Chile">
    <p class="ac-sub">Quedarás como administrador y podrás invitar a maestros y familias.</p><button type="submit" class="ac-btn sec">Crear congregación</button></form></details>
    <p class="ac-alt"><button class="ac-link" data-salir="1">Cerrar sesión</button></p>`);
    root().querySelectorAll("[data-com]").forEach((b) => b.addEventListener("click", () => entrar(lista.find((c) => c.id === b.dataset.com))));
    $("#acUnir").addEventListener("submit", async (e) => {
      e.preventDefault(); const cod = $("#acCodigo").value.trim(); if (!cod) return msg("Escribe el código.");
      ocupado(e.target, true, "Uniéndome…");
      const { data, error } = await sb.rpc("unirse_comunidad", { p_codigo: cod });
      ocupado(e.target, false, "Unirme");
      if (error) return msg(traducirError(error));
      LS.del("epk_invitacion"); const l = await misComunidades(); entrar(l.find((c) => c.id === data));
    });
    $("#acCrear").addEventListener("submit", async (e) => {
      e.preventDefault(); const n = $("#acNombreCom").value.trim(); if (n.length < 2) return msg("Escribe el nombre de la congregación.");
      ocupado(e.target, true, "Creando…");
      const { data, error } = await sb.rpc("crear_comunidad", { p_nombre: n, p_ciudad: $("#acCiudad").value.trim(), p_region: $("#acRegion").value.trim(), p_pais: $("#acPais").value.trim() || "Chile" });
      ocupado(e.target, false, "Crear congregación");
      if (error) return msg(traducirError(error));
      const l = await misComunidades(); entrar(l.find((c) => c.id === data), true);
    });
  }

  let iniciada = false;
  function entrar(c, nueva) {
    if (!c) return;
    LS.set("epk_comunidad_" + CTX.user.id, c.id);
    if (iniciada) { location.reload(); return; }
    CTX.comunidad = { id: c.id, nombre: c.nombre, codigo: c.codigo }; CTX.rol = c.rol;
    root().hidden = true; root().innerHTML = ""; iniciada = true;
    document.documentElement.dataset.rol = c.rol;
    window.iniciarApp();
    if (nueva) setTimeout(() => mostrarInvitacion(true), 600);
  }

  async function alIniciarSesion(user) {
    CTX.user = user;
    try { const { data: s } = await sb.rpc("soy_super"); CTX.super = !!s; } catch (e) { CTX.super = false; }
    let lista = [];
    try { lista = await misComunidades(); } catch (e) { marco(`<h1>Sin conexión</h1><p class="ac-sub">${esc(traducirError(e))}</p><button class="ac-btn" onclick="location.reload()">Reintentar</button>`); return; }
    CTX.comunidades = lista;
    const inv = LS.get("epk_invitacion");
    const guardada = LS.get("epk_comunidad_" + user.id);
    if (inv && !lista.some((c) => c.codigo === inv)) {
      const { data, error } = await sb.rpc("unirse_comunidad", { p_codigo: inv });
      if (error) { pantallaComunidad(lista); msg(traducirError(error)); return; }
      LS.del("epk_invitacion"); lista = await misComunidades(); CTX.comunidades = lista;
      return entrar(lista.find((c) => c.id === data));
    }
    if (inv) LS.del("epk_invitacion");
    const pedida = params.get("com");
    const elegida = (pedida && lista.find((c) => c.id === pedida)) || lista.find((c) => c.codigo === inv) || lista.find((c) => c.id === guardada) || (lista.length === 1 ? lista[0] : null);
    if (elegida) entrar(elegida); else pantallaComunidad(lista);
  }

  /* ---------- menú: invitar, miembros, cambiar de congregación, salir ---------- */
  function hoja(html) {
    const r = $("#menuRoot");
    r.innerHTML = `<div class="sheet-bg" id="mBg"><div class="sheet">${html}</div></div>`;
    $("#mBg").addEventListener("click", (e) => { if (e.target.id === "mBg" || e.target.closest("[data-cerrar]")) r.innerHTML = ""; });
    return r;
  }
  const ROLN = { admin: "Administrador", maestro: "Maestro", familia: "Familia" };
  function abrirMenu() {
    const c = CTX.comunidad; const nombreU = (CTX.user.user_metadata && CTX.user.user_metadata.nombre) || CTX.user.email;
    const r = hoja(`<h2>${esc(c.nombre)}</h2><p class="muted small">${esc(nombreU)} · ${ROLN[CTX.rol]}</p>
      <div class="list">
      ${equipo() ? `<button class="item" data-m="invitar"><span class="grow"><b>Invitar familias y maestros</b><span class="muted small">Código ${esc(c.codigo)}</span></span></button>` : ""}
      ${CTX.super ? `<a class="item" href="panel.html"><span class="grow"><b>Panel de Control</b><span class="muted small">Súper administrador: todas las congregaciones</span></span></a>` : ""}
      ${CTX.rol === "admin" ? `<button class="item" data-m="miembros"><span class="grow"><b>Miembros y roles</b><span class="muted small">Nombrar maestros y administradores</span></span></button>` : ""}
      <button class="item" data-m="cambiar"><span class="grow"><b>Cambiar o unirme a otra congregación</b></span></button>
      <a class="item" href="privacidad.html"><span class="grow"><b>Privacidad y términos</b></span></a>
      <button class="item" data-m="salir"><span class="grow"><b>Cerrar sesión</b></span></button></div>
      <button class="btn line" data-cerrar style="align-self:flex-end">Cerrar</button>`);
    r.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", async () => {
      const m = b.dataset.m;
      if (m === "invitar") mostrarInvitacion();
      if (m === "miembros") mostrarMiembros();
      if (m === "cambiar") { r.innerHTML = ""; root().hidden = false; pantallaComunidad(await misComunidades()); }
      if (m === "salir") { await sb.auth.signOut(); location.replace(location.pathname); }
    }));
  }
  function mostrarInvitacion(nueva) {
    const c = CTX.comunidad; const link = location.origin + location.pathname + "?c=" + c.codigo;
    const r = hoja(`<h2>${nueva ? "¡Congregación creada!" : "Invitar a la congregación"}</h2>
      <p>Comparte este enlace por WhatsApp con las familias y maestros. Al abrirlo crean su cuenta y quedan unidos a <b>${esc(c.nombre)}</b>.</p>
      <p class="sel" style="background:var(--sunk);padding:10px 12px;border-radius:10px">${esc(link)}</p>
      <p>O dales el código: <b style="font-family:var(--display);font-size:1.6rem;letter-spacing:.12em">${esc(c.codigo)}</b></p>
      <p class="muted small">Todos entran como <b>Familia</b>. Luego, en Miembros y roles, puedes nombrar a los maestros.</p>
      <div class="row between"><button class="btn ghost" id="mCopiar">Copiar enlace</button><button class="btn" data-cerrar>Listo</button></div>`);
    $("#mCopiar").addEventListener("click", async () => { try { await navigator.clipboard.writeText(link); $("#mCopiar").textContent = "¡Copiado!"; } catch (e) { $("#mCopiar").textContent = "Selecciona y copia el enlace"; } });
    return r;
  }
  async function mostrarMiembros() {
    const c = CTX.comunidad; hoja(`<h2>Miembros y roles</h2><p class="muted">Cargando…</p>`);
    const { data, error } = await sb.rpc("lista_miembros", { p_comunidad: c.id });
    if (error) { hoja(`<h2>Miembros y roles</h2><p>${esc(traducirError(error))}</p><button class="btn" data-cerrar>Cerrar</button>`); return; }
    const r = hoja(`<h2>Miembros y roles</h2><p class="muted small"><b>Maestro</b>: crea clases, marca asistencia, pone notas y sube material. <b>Administrador</b>: además nombra maestros. <b>Familia</b>: ve y usa la app.</p>
      <div class="list">${(data || []).map((m) => `<div class="item res"><span class="grow"><b>${esc(m.nombre || "Sin nombre")}${m.user_id === CTX.user.id ? " (tú)" : ""}</b><span class="muted small">${esc(m.email || "")}</span></span>
      <span class="acts"><select class="selclase" data-u="${esc(m.user_id)}" aria-label="Rol de ${esc(m.nombre)}">${["familia", "maestro", "admin"].map((k) => `<option value="${k}" ${k === m.rol ? "selected" : ""}>${ROLN[k]}</option>`).join("")}</select>
      ${m.user_id === CTX.user.id ? "" : `<button class="copy" data-quitar="${esc(m.user_id)}">Quitar</button>`}</span></div>`).join("")}</div>
      <p id="mMsg" class="small" style="color:var(--rose)" hidden></p><button class="btn" data-cerrar style="align-self:flex-end">Listo</button>`);
    const err = (e) => { const p = $("#mMsg"); p.textContent = traducirError(e); p.hidden = false; };
    r.querySelectorAll("select[data-u]").forEach((s) => s.addEventListener("change", async () => {
      const { error } = await sb.rpc("cambiar_rol", { p_comunidad: c.id, p_user: s.dataset.u, p_rol: s.value });
      if (error) { err(error); mostrarMiembros(); return; }
      if (s.dataset.u === CTX.user.id) location.reload();
    }));
    r.querySelectorAll("[data-quitar]").forEach((b) => b.addEventListener("click", async () => {
      if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "¿Seguro?"; return; }
      const { error } = await sb.rpc("quitar_miembro", { p_comunidad: c.id, p_user: b.dataset.quitar });
      if (error) return err(error); mostrarMiembros();
    }));
  }

  /* ---------- arranque ---------- */
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ir],[data-salir]"); if (!b || !root().contains(b)) return;
    if (b.dataset.salir) { sb.auth.signOut().then(() => location.replace(location.pathname)); return; }
    pantallaIngreso(b.dataset.ir);
  });
  let recuperando = false;
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === "PASSWORD_RECOVERY") { recuperando = true; pantallaNuevaClave(); return; }
    if (recuperando) return;
    if (session && session.user && !CTX.user) alIniciarSesion(session.user);
    if (ev === "SIGNED_OUT" && iniciada) location.replace(location.pathname);
  });
  sb.auth.getSession().then(({ data }) => {
    if (recuperando) return;
    if (data.session && data.session.user) { if (!CTX.user) alIniciarSesion(data.session.user); }
    else pantallaIngreso();
  });
})();
