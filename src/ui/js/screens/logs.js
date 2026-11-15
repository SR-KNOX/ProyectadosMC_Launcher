/* Pantalla: Logs. Historial de cambios del modpack por actualización.
   El archivo oficial vive en GitHub (mi-server-mods/logs.json, formato { schema, updated, releases }).
   Si GitHub no responde, se usa CONFIG.changelog como respaldo offline.

   Lógica de "no visto" (independiente del modpack y de sus actualizaciones):
   · Cada bloque de logs (release) lleva un "id" único (recomendado: la versión).
   · Se guarda el id del bloque más reciente que el jugador ya abrió en
     localStorage['pmc.logsSeen'].
   · Si el más reciente no coincide, aparece el punto verde en "Logs" y el aviso
     "Nuevos cambios". Al entrar a la pantalla, se marca como visto y el punto desaparece. */
import { $ } from '../utils.js';
import { CONFIG } from '../config.js';
import { state } from '../state.js';
import { store } from '../storage.js';
import { showScreen } from '../router.js';

const TYPES = { new: 'Nuevo', change: 'Cambio', fix: 'Corregido', remove: 'Eliminado' };
const ICONS = { new: '#i-spark', change: '#i-swap', fix: '#i-check', remove: '#i-trash' };
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const cmp = (a, b) => {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};

const seenId = () => store.get(CONFIG.storageKeys.logsSeen);

/* Normaliza cualquiera de los formatos soportados a { schema, updated, releases[] }:
   · Objeto actual: { schema, updated, releases: [...] }
   · Arreglo heredado: [ { version, date, title, items }, ... ] (se le genera id = version) */
function normalize(data) {
  if (Array.isArray(data)) {
    return { schema: 1, updated: '', releases: data.map((r, i) => ({ id: String(r.id || r.version || `r${i}`), ...r })) };
  }
  if (data && Array.isArray(data.releases)) {
    const releases = data.releases.map((r, i) => ({ ...r, id: String(r.id || r.version || `r${i}`) }));
    return { schema: data.schema || 1, updated: data.updated || '', releases };
  }
  return { schema: 1, updated: '', releases: [] };
}

let cached = null;

async function fetchJsonWithTimeout(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const bust = url + (url.includes('?') ? '&' : '?') + '_=' + Date.now();
    const r = await fetch(bust, { cache: 'no-store', signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchLogs() {
  if (cached) return cached;
  const urls = [CONFIG.logs && CONFIG.logs.url, CONFIG.logs && CONFIG.logs.fallbackUrl].filter(Boolean);
  for (const url of urls) {
    try {
      const data = normalize(await fetchJsonWithTimeout(url));
      cached = data;
      return cached;
    } catch { /* probar el respaldo */ }
  }
  cached = normalize(CONFIG.changelog);
  return cached;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/* "2026-11-13" -> "13 nov 2026" (si no se puede parsear, muestra el original) */
function formatDate(raw) {
  if (!raw) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw).trim());
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!Number.isNaN(d.getTime())) return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
  }
  return String(raw);
}

function iconUse(href) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ico');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', href);
  svg.append(use);
  return svg;
}

function paintDot(on) {
  const d = $('logsDot');
  if (d) d.hidden = !on;
}

/* ¿Hay logs más nuevos que los que ya vio el jugador? (sin pintar nada) */
export async function hasNewLogs() {
  const data = await fetchLogs();
  return !!(data.releases.length && data.releases[0].id !== seenId());
}

/* Comprobación silenciosa al abrir el launcher: pinta el punto verde si hay novedades.
   Devuelve true/false. Nunca lanza errores. */
export async function checkLogs() {
  try {
    const has = await hasNewLogs();
    paintDot(has);
    return has;
  } catch {
    return false;
  }
}

function markSeen(releases) {
  if (releases.length) store.set(CONFIG.storageKeys.logsSeen, releases[0].id);
  paintDot(false);
}

async function render() {
  const list = $('logList');
  list.replaceChildren();
  const { releases } = await fetchLogs();

  if (!releases.length) {
    list.append(el('p', 'empty', 'Todavía no hay notas publicadas. Vuelve pronto.'));
    markSeen(releases);
    return;
  }

  const seen = seenId();
  releases.forEach((v, idx) => {
    const isNew = v.id !== seen;
    const d = el('details', 'log' + (isNew ? ' log-new' : ''));
    d.open = idx === 0;

    const s = el('summary');
    s.append(el('span', 'log-ver', 'v' + (v.version || '')));
    s.append(el('span', 'log-title', v.title || 'Actualización'));
    if (isNew) s.append(el('span', 'tag t-new log-tagnew', 'Nuevo'));
    if (cmp(v.version, state.local) === 0) s.append(el('span', 'tag t-current', 'Instalada'));
    else if (cmp(v.version, state.local) > 0 && cmp(v.version, state.remote) <= 0) s.append(el('span', 'tag t-avail', 'Disponible'));
    s.append(el('span', 'log-date', formatDate(v.date)));
    d.append(s);

    const ul = el('ul', 'log-items');
    (v.items || []).forEach(it => {
      const li = el('li');
      const type = ICONS[it && it.type] ? it.type : 'change';
      const icoWrap = el('span', 'log-ico t-ico-' + type);
      icoWrap.append(iconUse(ICONS[type]));
      li.append(icoWrap);
      li.append(el('span', 'log-text', (it && (it.text || it)) || ''));
      ul.append(li);
    });
    d.append(ul);
    list.append(d);
  });

  markSeen(releases);
}

export function initLogsScreen() {
  $('navLogs').onclick = () => { render(); showScreen('s-logs'); };
}
