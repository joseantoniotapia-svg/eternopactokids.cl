/* Línea de tiempo · extras compartidos por la app (/app) y la web (/linea)
   Narración en voz alta, mapa, compartir, pasaporte de épocas y trivia.
   © Eterno Pacto KIDS · JAT® */
(function () {
"use strict";
const C = { LT: [], ERAS: [], vistos: () => ({}), nombre: n => "", puntos: null, web: "https://eternopactokids.cl/linea" };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const leer = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") || d; } catch (e) { return d; } };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const mezclar = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const libro = c => String(c || "").split(";")[0].replace(/\s*\d+\s*[:.].*$/, "").replace(/\s+\d+\s*$/, "").trim();

/* ---------- estilos ---------- */
const CSS = `
.ltx-acc{display:flex;gap:8px;flex-wrap:wrap}
.ltx-b{border:0;border-radius:999px;padding:9px 14px;font:inherit;font-weight:800;font-size:.88rem;cursor:pointer;background:#EFE8FF;color:#3A2A8C;display:inline-flex;align-items:center;gap:6px}
.ltx-b:hover{filter:brightness(.97)}.ltx-b[aria-pressed="true"]{background:#3A2A8C;color:#fff}
.ltx-b.wa{background:#25D366;color:#fff}
.ltx-mapa{border-radius:14px;overflow:hidden;background:#F3E7C9;border:2px solid #E3D3A8}
.ltx-mapa svg{display:block;width:100%;height:auto}
.ltx-mapa p{margin:0;padding:6px 10px;font-size:.78rem;font-weight:700;color:#6B5A33;background:#EEDFB8}
.ltx-pas{margin:14px 12px 0;padding:14px;border-radius:20px;background:linear-gradient(160deg,rgba(255,255,255,.10),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.18);color:#fff}
.ltx-pas h3{margin:0 0 2px;font-size:1.1rem;text-align:center}.ltx-pas>p{margin:0 0 10px;text-align:center;font-size:.82rem;color:#CFC8FF}
.ltx-sellos{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:10px}
.ltx-sello{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 6px;border-radius:16px;background:rgba(0,0,0,.18);border:2px dashed rgba(255,255,255,.25);text-align:center}
.ltx-sello .s-c{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;font-size:1.6rem;background:rgba(255,255,255,.08);border:3px dashed rgba(255,255,255,.3);filter:grayscale(1);opacity:.55}
.ltx-sello.ok{border-style:solid;border-color:var(--era)}
.ltx-sello.ok .s-c{filter:none;opacity:1;background:var(--era);border:3px double #fff;transform:rotate(-8deg);box-shadow:0 0 0 3px rgba(0,0,0,.15)}
.ltx-sello b{font-size:.74rem;line-height:1.15}.ltx-sello small{font-size:.7rem;color:#CFC8FF}
.ltx-barra{width:100%;height:6px;border-radius:9px;background:rgba(255,255,255,.15);overflow:hidden}.ltx-barra i{display:block;height:100%;background:var(--era)}
.ltx-sello .ltx-tri{margin-top:2px;padding:5px 10px;font-size:.72rem;background:#FFC93C;color:#2A1D00}
.ltx-sello .ltx-med{position:absolute;top:4px;right:6px;font-size:1rem}
.ltx-premio{margin-top:12px;padding:12px;border-radius:16px;text-align:center;background:rgba(0,0,0,.2);border:2px dashed rgba(255,201,60,.5)}
.ltx-premio.ok{background:linear-gradient(135deg,#FFC93C,#FF8A3D);color:#2A1D00;border:0}
.ltx-premio b{display:block;font-size:1rem}.ltx-premio span{font-size:.8rem}
.ltx-tq{display:flex;flex-direction:column;gap:8px}
.ltx-tq h3{margin:0;font-size:1.05rem}
.ltx-op{border:2px solid #E4DCFF;background:#fff;border-radius:14px;padding:11px 12px;font:inherit;font-weight:700;text-align:left;cursor:pointer;color:#1E1548}
.ltx-op.bien{background:#D8F7E3;border-color:#2DBE6C}.ltx-op.mal{background:#FFE0E0;border-color:#E5484D}
.ltx-op:disabled{cursor:default}
.ltx-pts{display:flex;gap:6px;justify-content:center;font-size:1.6rem}
.ltx-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%) translateY(30px);opacity:0;z-index:9999;background:#1E1548;color:#fff;padding:12px 18px;border-radius:16px;font-weight:800;box-shadow:0 8px 24px rgba(0,0,0,.35);transition:.35s;max-width:min(92vw,420px);text-align:center}
.ltx-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}
.ltx-conf{position:fixed;inset:0;pointer-events:none;z-index:9998;overflow:hidden}
.ltx-conf i{position:absolute;top:-20px;width:10px;height:14px;border-radius:2px;animation:ltxCae 2.4s ease-in forwards}
@keyframes ltxCae{to{transform:translateY(110vh) rotate(720deg)}}
.lt-cara.gris{position:relative}.lt-cara.gris::after{content:"🔒";position:absolute;right:-4px;bottom:-2px;font-size:1rem;filter:drop-shadow(0 1px 1px rgba(0,0,0,.4))}
@media (prefers-reduced-motion:reduce){.ltx-conf{display:none}}
`;
function estilos() { if (document.getElementById("ltxCss")) return; const s = document.createElement("style"); s.id = "ltxCss"; s.textContent = CSS; document.head.appendChild(s); }

function toast(msg) { let t = document.getElementById("ltxToast"); if (!t) { t = document.createElement("div"); t.id = "ltxToast"; t.className = "ltx-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("on"); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("on"), 3600); }
function confeti() { const d = document.createElement("div"); d.className = "ltx-conf"; const col = ["#FFC93C", "#FF6B9A", "#5BD27A", "#5AB8FF", "#B48CFF", "#FF8A3D"];
  for (let i = 0; i < 70; i++) { const c = document.createElement("i"); c.style.left = Math.random() * 100 + "vw"; c.style.background = col[i % col.length]; c.style.animationDelay = Math.random() * .8 + "s"; c.style.animationDuration = 1.8 + Math.random() * 1.4 + "s"; d.appendChild(c); }
  document.body.appendChild(d); setTimeout(() => d.remove(), 4000); }

/* ---------- 🔊 narración ---------- */
let VOZ = null, HABLA = null;
function vozEs() { if (VOZ) return VOZ; const vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
  const pref = ["es-CL", "es-419", "es-US", "es-MX", "es-AR", "es-CO", "es-ES"];
  for (const p of pref) { const v = vs.find(x => (x.lang || "").replace("_", "-").toLowerCase() === p.toLowerCase()); if (v) return VOZ = v; }
  return VOZ = vs.find(x => /^es/i.test(x.lang || "")) || null; }
if (window.speechSynthesis) { try { speechSynthesis.onvoiceschanged = () => { VOZ = null; }; } catch (e) {} }
function citaHablada(c) { return String(c || "").split(";")[0].replace(/(\d+)\s*:\s*(\d+)\s*-\s*(\d+)/g, "capítulo $1, versículos $2 al $3").replace(/(\d+)\s*:\s*(\d+)/g, "capítulo $1, versículo $2").replace(/(\d+)\s*-\s*(\d+)/g, "capítulos $1 al $2"); }
function callar() { if (window.speechSynthesis) try { speechSynthesis.cancel(); } catch (e) {} if (HABLA) { HABLA.setAttribute("aria-pressed", "false"); HABLA.innerHTML = "🔊 Escuchar"; } HABLA = null; }
function narrar(i, b) { if (!window.speechSynthesis) return; if (HABLA === b) { callar(); return; } callar(); const h = C.LT[i]; if (!h) return;
  const u = new SpeechSynthesisUtterance(`${h.titulo}. ${h.texto} Lo encuentras en ${citaHablada(h.cita)}.`);
  const v = vozEs(); if (v) u.voice = v; u.lang = v ? v.lang : "es-419"; u.rate = .95; u.pitch = 1.05;
  u.onend = u.onerror = () => { if (HABLA === b) callar(); };
  HABLA = b; b.setAttribute("aria-pressed", "true"); b.innerHTML = "⏹️ Detener"; speechSynthesis.speak(u);
  const vigila = setInterval(() => { if (HABLA !== b) { clearInterval(vigila); return; } if (!document.body.contains(b)) { clearInterval(vigila); callar(); } }, 400); }

/* ---------- 🗺️ mapa ---------- */
/* [palabras clave (normalizadas), nombre, longitud, latitud] */
const LUGARES = [
  [/\bur\b|caldeos/, "Ur", 46.1, 30.96], [/haran/, "Harán", 39.03, 36.86], [/babel|babilon/, "Babilonia", 44.42, 32.54], [/ninive/, "Nínive", 43.15, 36.36],
  [/ararat/, "Montes de Ararat", 44.3, 39.4], [/persia|susa|ester\b|asuero/, "Susa (Persia)", 48.25, 32.19],
  [/gosen/, "Gosén", 31.8, 30.7], [/egipt|faraon|nilo/, "Egipto", 31.25, 30.05], [/mar rojo/, "Mar Rojo", 32.6, 29.6], [/sinai|horeb|mandamientos/, "Monte Sinaí", 33.97, 28.54],
  [/madian/, "Madián", 35.3, 28.3], [/nebo/, "Monte Nebo", 35.73, 31.77], [/moab/, "Moab", 35.85, 31.3], [/jerico/, "Jericó", 35.44, 31.87],
  [/jordan/, "Río Jordán", 35.56, 32.35], [/canaan|tierra prometida/, "Canaán", 35.1, 32.2], [/betel/, "Betel", 35.22, 31.93], [/hebron|mambre/, "Hebrón", 35.1, 31.53],
  [/siquem/, "Siquem", 35.28, 32.21], [/silo\b/, "Siló", 35.29, 32.06], [/sodoma|gomorra/, "Sodoma", 35.4, 31.15], [/gaza|filiste|goliat/, "Filistea", 34.55, 31.6],
  [/carmelo/, "Monte Carmelo", 35.0, 32.73], [/samaria/, "Samaria", 35.19, 32.28], [/jope|jonas/, "Jope", 34.75, 32.05],
  [/jerusalen|sion\b|templo|getsemani|golgota|calvario|pentecostes|cenaculo/, "Jerusalén", 35.23, 31.78], [/belen|pesebre|pastores|magos/, "Belén", 35.2, 31.7],
  [/betania|lazaro/, "Betania", 35.26, 31.77], [/nazaret/, "Nazaret", 35.3, 32.7], [/cana\b/, "Caná", 35.34, 32.75], [/capernaum|cafarnaum/, "Capernaúm", 35.57, 32.88],
  [/galilea/, "Mar de Galilea", 35.58, 32.8], [/damasco/, "Damasco", 36.3, 33.51], [/antioquia/, "Antioquía", 36.16, 36.2], [/tarso/, "Tarso", 34.9, 36.92],
  [/chipre/, "Chipre", 33.2, 35.1], [/efeso/, "Éfeso", 27.34, 37.94], [/patmos/, "Patmos", 26.55, 37.31], [/corinto/, "Corinto", 22.93, 37.9],
  [/atenas/, "Atenas", 23.73, 37.98], [/filipos/, "Filipos", 24.29, 41.01], [/\broma\b|romanos/, "Roma", 12.5, 41.9]
];

/* Lugares extra (sin palabra clave en el texto): nombre, longitud, latitud */
const EXTRA = { "Edén (Mesopotamia)": [45.5, 31.2], "Beerseba": [34.8, 31.25], "Peniel": [35.65, 32.18], "Cades": [34.4, 30.6], "Monte Tabor": [35.39, 32.69],
  "Valle de Jezreel": [35.33, 32.56], "Galaad": [35.8, 32.2], "Gabaa": [35.23, 31.82], "Tecoa": [35.21, 31.63], "Cesarea": [34.89, 32.5], "Sabá": [45, 15.5], "Monte Moriah": [35.235, 31.778] };
/* Lugares por número de momento (1 a 129) */
const POR_HITO = { 2: ["Edén (Mesopotamia)"], 3: ["Edén (Mesopotamia)"], 8: ["Montes de Ararat"], 9: ["Montes de Ararat"], 12: ["Ur", "Harán", "Canaán"], 13: ["Hebrón"], 14: ["Beerseba"],
  16: ["Beerseba"], 17: ["Monte Moriah"], 18: ["Harán"], 19: ["Beerseba"], 20: ["Betel"], 21: ["Harán"], 22: ["Peniel"], 25: ["Egipto"], 26: ["Egipto"], 29: ["Monte Sinaí"],
  33: ["Mar Rojo"], 34: ["Monte Sinaí"], 36: ["Monte Sinaí"], 37: ["Monte Sinaí"], 38: ["Cades"], 39: ["Cades", "Monte Sinaí"], 40: ["Jericó"], 43: ["Hebrón"], 44: ["Canaán"],
  45: ["Monte Tabor"], 46: ["Valle de Jezreel"], 47: ["Moab", "Belén"], 48: ["Belén"], 49: ["Siló"], 50: ["Galaad"], 51: ["Siló"], 52: ["Filistea"], 53: ["Gabaa"], 54: ["Belén"],
  56: ["Gabaa"], 57: ["Gabaa"], 58: ["Hebrón"], 59: ["Hebrón", "Jerusalén"], 61: ["Jerusalén"], 62: ["Jerusalén", "Hebrón"], 63: ["Jerusalén"], 65: ["Jerusalén", "Sabá"],
  66: ["Siquem", "Jerusalén"], 68: ["Valle de Jezreel"], 69: ["Jericó", "Río Jordán"], 70: ["Damasco", "Samaria"], 72: ["Tecoa", "Betel"], 73: ["Samaria"], 74: ["Jerusalén"],
  76: ["Samaria", "Nínive"], 78: ["Jerusalén"], 79: ["Jerusalén"], 82: ["Babilonia"], 83: ["Babilonia"], 85: ["Babilonia"], 89: ["Babilonia", "Jerusalén"], 92: ["Jerusalén"],
  93: ["Nazaret"], 94: ["Nazaret", "Jerusalén"], 95: ["Jerusalén"], 99: ["Río Jordán"], 100: ["Mar de Galilea"], 102: ["Capernaúm"], 103: ["Mar de Galilea"], 104: ["Mar de Galilea"],
  105: ["Mar de Galilea"], 106: ["Mar de Galilea"], 107: ["Mar de Galilea"], 108: ["Betania"], 110: ["Jericó"], 112: ["Jerusalén"], 113: ["Jerusalén"], 114: ["Jerusalén"],
  115: ["Jerusalén"], 116: ["Betania", "Jerusalén"], 118: ["Jerusalén"], 120: ["Jerusalén", "Antioquía", "Tarso"], 121: ["Jope", "Cesarea"], 122: ["Antioquía", "Chipre"],
  124: ["Antioquía", "Filipos"], 125: ["Corinto", "Éfeso", "Filipos", "Roma"], 129: ["Éfeso"] };
const MAR = [[10,44],[22,40.2],[23.1,38.6],[22.6,36.6],[24,37.6],[24.4,38.6],[26,40.6],[26.3,39.2],[27.2,37.4],[28,36.7],[30,36.3],[32,36.05],[34,36.4],[35.7,36.8],[36.1,36.3],[35.8,35.5],[35.9,34.6],[35.5,33.9],[35.1,33.1],[34.9,32.4],[34.5,31.5],[34.2,31.3],[33,31.1],[32,31.1],[31,31.55],[30,31.3],[29,30.9],[25,31.8],[20,32],[10,33]];
const CHIPRE = [[32.3,35],[32.9,35.4],[34.6,35.7],[34,35],[33,34.6]];
const ROJO = [[32.55,30],[32.6,29.6],[33.6,28.2],[34.4,27.9],[34.95,29.5],[34.6,28.1],[35.2,27.2],[37,24],[33,24],[32.55,30]];
const GOLFO = [[47.9,30.1],[48.5,29.9],[50,29.6],[51,28],[52,27],[49,26.5],[48.3,28.6],[47.9,30.1]];
const RIOS = [[[31,24],[31.15,27],[31.2,29.5],[31.2,30.1],[30.4,31.4]],[[31.2,30.1],[31.8,31.5]],
  [[35.6,33.25],[35.58,32.8],[35.55,32.3],[35.55,31.78]],
  [[38.5,38.5],[38.3,36.5],[40,35],[41.5,34.4],[43.3,33.3],[44.4,32.5],[46,31],[47.5,30.5],[48.3,30]],
  [[40.5,38.5],[42.5,37.2],[43.1,36.3],[43.7,35],[44.4,33.3],[46,32],[47.5,30.5]]];
function lugaresDe(h) { const t = norm(`${h.titulo} ${h.texto}`); const out = []; const pon = L => { if (!out.some(o => o[1] === L[1])) out.push(L); };
  const n = C.LT.indexOf(h) + 1; (POR_HITO[n] || []).forEach(nm => { const L = LUGARES.find(x => x[1] === nm); if (L) pon(L); else if (EXTRA[nm]) pon([null, nm, EXTRA[nm][0], EXTRA[nm][1]]); });
  LUGARES.forEach(L => { if (L[0].test(t)) pon(L); }); return out; }
function mapa(h) { const ls = lugaresDe(h); if (!ls.length) return "";
  const cerca = ls.filter(l => l[2] > 20 && l[3] > 24); const lejos = ls.filter(l => !(l[2] > 20 && l[3] > 24));
  const base = cerca.length ? cerca : [["", "Jerusalén", 35.23, 31.78]];
  let x0 = Math.min(...base.map(l => l[2])), x1 = Math.max(...base.map(l => l[2])), y0 = Math.min(...base.map(l => l[3])), y1 = Math.max(...base.map(l => l[3]));
  const W = 340, H = 210, K = .84; /* cos(lat) aprox. */
  let sx = Math.max((x1 - x0) * K, 3), sy = Math.max(y1 - y0, 3);
  if (sx / sy > W / H) sy = sx * H / W; else sx = sy * W / H;
  sx *= 1.9; sy *= 1.9; const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const px = lon => ((lon - cx) * K / sx + .5) * W, py = lat => (.5 - (lat - cy) / sy) * H;
  const pts = a => a.map(([lo, la]) => px(lo).toFixed(1) + "," + py(la).toFixed(1)).join(" ");
  const grande = sx > 9; const dz = grande ? 1 : 1.6;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa: ${esc(ls.map(l => l[1]).join(", "))}"><rect width="${W}" height="${H}" fill="#F3E7C9"/>`;
  [MAR, CHIPRE, ROJO, GOLFO].forEach(p => { s += `<polygon points="${pts(p)}" fill="#9FD3F0" stroke="#7DB8DA" stroke-width="1.2"/>`; });
  s += `<ellipse cx="${px(35.5)}" cy="${py(31.5)}" rx="${Math.max(1.5, .09 * K / sx * W)}" ry="${Math.max(3, .45 / sy * H / 2)}" fill="#9FD3F0" stroke="#7DB8DA"/>`;
  s += `<ellipse cx="${px(35.58)}" cy="${py(32.82)}" rx="${Math.max(1.5, .07 * K / sx * W)}" ry="${Math.max(2, .12 / sy * H)}" fill="#9FD3F0" stroke="#7DB8DA"/>`;
  RIOS.forEach(r => { s += `<polyline points="${pts(r)}" fill="none" stroke="#5AA9DA" stroke-width="${grande ? 1.4 : 2}" stroke-linecap="round" stroke-linejoin="round"/>`; });
  s += `<text x="${W - 8}" y="${H - 8}" text-anchor="end" font-size="9" fill="#8A7A5C" font-weight="700">N ↑ · mapa aproximado</text>`;
  const usados = [];
  cerca.forEach((l, k) => { const x = px(l[2]), y = py(l[3]); let ty = y - 10 * dz / 1.6 - 2; while (usados.some(u => Math.abs(u[0] - x) < 70 && Math.abs(u[1] - ty) < 13)) ty += 14; usados.push([x, ty]);
    const anc = x > W - 60 ? "end" : x < 60 ? "start" : "middle";
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.5" fill="#E5484D" stroke="#fff" stroke-width="2"/><text x="${x.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${anc}" font-size="12" font-weight="800" fill="#3A2A1A" stroke="#F3E7C9" stroke-width="3" paint-order="stroke">${esc(l[1])}</text>`; });
  lejos.forEach((l, k) => { const sur = l[3] <= 24; s += `<text x="${sur ? W - 8 : 8}" y="${sur ? H - 24 - k * 16 : 18 + k * 16}" text-anchor="${sur ? "end" : "start"}" font-size="12" font-weight="800" fill="#3A2A1A">${sur ? "↓ " + esc(l[1]) : "← " + esc(l[1])}</text>`; });
  s += `</svg>`;
  return `<div class="ltx-mapa">${s}<p>🗺️ ¿Dónde pasó? ${esc(ls.map(l => l[1]).join(" · "))}</p></div>`; }

/* ---------- 📤 compartir ---------- */
function linkDe(i) { return C.web + "#m-" + (i + 1); }
async function compartir(i) { const h = C.LT[i]; if (!h) return; const url = linkDe(i);
  const txt = `${h.emoji} «${h.titulo}» (${h.cita.split(";")[0]})\n${h.texto}\n\nViaja por «La gran historia de Dios» de Eterno Pacto KIDS:`;
  if (navigator.share) { try { await navigator.share({ title: h.titulo, text: txt, url }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
  window.open("https://wa.me/?text=" + encodeURIComponent(txt + " " + url), "_blank", "noopener"); }

/* ---------- bloque dentro de la ficha de un momento ---------- */
function bloqueHito(i) { const h = C.LT[i]; if (!h) return "";
  const voz = window.speechSynthesis ? `<button class="ltx-b" data-ltx="voz" data-i="${i}" aria-pressed="false">🔊 Escuchar</button>` : "";
  return `<div class="ltx-acc">${voz}<button class="ltx-b wa" data-ltx="compartir" data-i="${i}">📤 Compartir</button></div>${mapa(h)}`; }

/* ---------- 🛂 pasaporte de épocas ---------- */
const SELLO = ["🌍", "🌈", "⛺", "🌊", "🗡️", "👑", "🔥", "🏛️", "⭐", "🕊️"];
function eraTotales(ei) { const v = C.vistos(); const hs = C.LT.filter(h => h.era === ei); return { n: hs.filter(h => v[h.id]).length, t: hs.length }; }
function pasaporteHTML() { const tri = leer("epk_lt_trivia", {}); const v = C.vistos(); const total = C.LT.filter(h => v[h.id]).length;
  const sellos = C.ERAS.map((e, ei) => { const { n, t } = eraTotales(ei); const ok = t && n >= t;
    return `<div class="ltx-sello${ok ? " ok" : ""}" style="--era:${e[1]}">${tri[ei] >= 2 ? `<span class="ltx-med" title="Trivia superada">🏅</span>` : ""}<span class="s-c">${ok ? SELLO[ei % SELLO.length] : ei + 1}</span><b>${esc(e[0])}</b><span class="ltx-barra"><i style="width:${t ? Math.round(n * 100 / t) : 0}%"></i></span><small>${ok ? "¡Sellado!" : `${n} de ${t}`}</small><button class="ltx-b ltx-tri" data-ltx="trivia" data-e="${ei}">❓ Trivia</button></div>`; }).join("");
  const todo = total >= C.LT.length;
  return `<h3>🛂 Mi pasaporte de épocas</h3><p>Visita todos los momentos de una época para ganar su sello. Responde su trivia para ganar la medalla 🏅.</p><div class="ltx-sellos">${sellos}</div>
  <div class="ltx-premio${todo ? " ok" : ""}">${todo ? `<b>🏆 ¡Viajero del tiempo!</b><span>Recorriste los ${C.LT.length} momentos de la gran historia de Dios.</span>` : `<b>🏆 Premio «Viajero del tiempo»</b><span>Te faltan ${C.LT.length - total} momentos para recorrer toda la historia.</span>`}</div>`; }
function pasaporte() { return `<section class="ltx-pas" id="ltxPas">${pasaporteHTML()}</section>`; }
function refrescar() { const p = document.getElementById("ltxPas"); if (p) p.innerHTML = pasaporteHTML(); }
/* Llamar justo después de marcar un momento como visitado por primera vez */
function visitado(i) { const h = C.LT[i]; if (!h) return; const { n, t } = eraTotales(h.era); const v = C.vistos(); const total = C.LT.filter(x => v[x.id]).length;
  if (total >= C.LT.length) { setTimeout(() => { confeti(); toast(`🏆 ¡Eres Viajero del tiempo! Recorriste los ${C.LT.length} momentos`); }, 700); if (C.puntos) C.puntos("linea", "lt-pasaporte"); }
  else if (n >= t) { setTimeout(() => { confeti(); toast(`🛂 ¡Sello conseguido! Completaste «${C.ERAS[h.era][0]}»`); }, 700); if (C.puntos) C.puntos("linea", "lt-era-" + (h.era + 1)); }
  refrescar(); }

/* ---------- ❓ trivia por época ---------- */
function preguntas(ei) { const era = C.LT.filter(h => h.era === ei), otras = C.LT.filter(h => h.era !== ei); const qs = [];
  const libros = [...new Set(C.LT.map(h => libro(h.cita)).filter(Boolean))];
  { const h = mezclar(era)[0]; const ok = libro(h.cita); if (ok) qs.push({ q: `¿En qué libro de la Biblia leemos «${h.titulo}»?`, ok, ops: [ok, ...mezclar(libros.filter(b => b !== ok)).slice(0, 3)] }); }
  if (era.length >= 3) { const tres = mezclar(era).slice(0, 3); const pri = tres.slice().sort((a, b) => C.LT.indexOf(a) - C.LT.indexOf(b))[0]; qs.push({ q: "¿Cuál de estos momentos pasó primero?", ok: pri.titulo, ops: tres.map(x => x.titulo) }); }
  { const conP = mezclar(era.filter(h => h.pers.length && C.nombre(h.pers[0]))); if (conP.length) { const h = conP[0]; const ok = C.nombre(h.pers[0]); const malos = [...new Set(otras.flatMap(x => x.pers).filter(n => !h.pers.includes(n)).map(n => C.nombre(n)).filter(Boolean))];
    qs.push({ q: `¿Quién aparece en «${h.titulo}»?`, ok, ops: [ok, ...mezclar(malos.filter(x => x !== ok)).slice(0, 3)] }); } }
  { const h = mezclar(era)[0]; qs.push({ q: `¿Cuál de estos momentos es de la época «${C.ERAS[ei][0]}»?`, ok: h.titulo, ops: [h.titulo, ...mezclar(otras).slice(0, 3).map(x => x.titulo)] }); }
  return mezclar(qs).slice(0, 3).map(q => ({ ...q, ops: mezclar(q.ops) })); }
let TQ = null;
function hoja(html, era) { const r = document.getElementById("sheetRoot"); if (!r) return; callar();
  r.innerHTML = `<div class="sheet-bg" id="sheetBg"><div class="sheet lt-ficha" style="--era:${era}" role="dialog" aria-modal="true" aria-label="Trivia">${html}</div></div>`;
  document.getElementById("sheetBg").addEventListener("click", ev => { if (ev.target.id === "sheetBg") r.innerHTML = ""; }); }
function trivia(ei) { TQ = { ei, qs: preguntas(ei), k: 0, bien: 0 }; pintarTrivia(); }
function pintarTrivia() { const e = C.ERAS[TQ.ei]; const q = TQ.qs[TQ.k];
  if (!q) { const b = TQ.bien, tot = TQ.qs.length; const tri = leer("epk_lt_trivia", {}); const antes = tri[TQ.ei] || 0; if (b > antes) { tri[TQ.ei] = b; guardar("epk_lt_trivia", tri); }
    if (b >= 2) { confeti(); if (C.puntos) C.puntos("quiz", "lt-trivia-" + (TQ.ei + 1)); }
    hoja(`<p class="lt-f-era">Trivia · ${esc(e[0])}</p><div class="ltx-pts">${Array.from({ length: tot }, (_, i) => i < b ? "⭐" : "☆").join("")}</div><h2 style="text-align:center">${b === tot ? "¡Perfecto!" : b >= 2 ? "¡Muy bien!" : "¡Sigue intentando!"}</h2>
      <p style="text-align:center">Acertaste ${b} de ${tot}.${b >= 2 ? " Ganaste la medalla 🏅 de esta época." : " Con 2 aciertos ganas la medalla 🏅."}</p>
      <div class="row between"><button class="btn line sm" data-ltx="trivia" data-e="${TQ.ei}">🔁 Otra vez</button><button class="btn sm" data-ltx="cerrar">Listo</button></div>`, e[1]);
    refrescar(); return; }
  hoja(`<p class="lt-f-era">Trivia · ${esc(e[0])} · ${TQ.k + 1} de ${TQ.qs.length}</p><div class="ltx-tq"><h3>${esc(q.q)}</h3>${q.ops.map(o => `<button class="ltx-op" data-ltx="resp" data-o="${esc(o)}">${esc(o)}</button>`).join("")}</div>
    <div class="row between"><button class="btn line sm" data-ltx="cerrar">Salir</button><span></span></div>`, e[1]); }
function responder(b) { const q = TQ && TQ.qs[TQ.k]; if (!q) return; const ok = b.dataset.o === q.ok; if (ok) TQ.bien++;
  document.querySelectorAll(".ltx-op").forEach(x => { x.disabled = true; if (x.dataset.o === q.ok) x.classList.add("bien"); });
  if (!ok) b.classList.add("mal"); TQ.k++; setTimeout(pintarTrivia, ok ? 900 : 1700); }

/* ---------- clics ---------- */
document.addEventListener("click", ev => { const b = ev.target.closest("[data-ltx]"); if (!b) return; ev.preventDefault();
  const a = b.dataset.ltx;
  if (a === "voz") narrar(Number(b.dataset.i), b);
  else if (a === "compartir") compartir(Number(b.dataset.i));
  else if (a === "trivia") trivia(Number(b.dataset.e));
  else if (a === "resp") responder(b);
  else if (a === "cerrar") { const r = document.getElementById("sheetRoot"); if (r) r.innerHTML = ""; } });

window.LTX = {
  init(o) { Object.assign(C, o || {}); estilos(); },
  bloqueHito, pasaporte, refrescar, visitado, trivia, callar, lugaresDe, linkDe,
  /* #m-12 → índice 11 */
  hashIdx() { const m = String(location.hash || "").match(/^#m-(\d+)$/); const i = m ? Number(m[1]) - 1 : -1; return i >= 0 && i < C.LT.length ? i : -1; }
};
})();
