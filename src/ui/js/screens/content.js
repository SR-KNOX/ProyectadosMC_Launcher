/* Pantalla: Contenido. Mods, resource packs y shaders instalados. */
import { $ } from '../utils.js';
import { showScreen } from '../router.js';
import { store } from '../storage.js';

const TYPES = [
  { key: 'mods', label: 'Mods' },
  { key: 'resourcepacks', label: 'Resource packs' },
  { key: 'shaderpacks', label: 'Shaders' },
];

let activeType = 'mods';
let data = { mods: [], resourcepacks: [], shaderpacks: [] };
const sessionNew = { mods: new Set(), resourcepacks: new Set(), shaderpacks: new Set() };
let iconCache = {};
try { iconCache = JSON.parse(store.get('contentIcons') || '{}') || {}; } catch { iconCache = {}; }
const iconPending = new Map();
let renderToken = 0;
let searchTimer = null;

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

async function load() {
  if (window.api && typeof window.api.contentList === 'function') {
    const r = await window.api.contentList();
    if (r && r.ok) {
      data.mods = r.mods || [];
      data.resourcepacks = r.resourcepacks || [];
      data.shaderpacks = r.shaderpacks || [];
    }
  }
}

function saveIconCache() {
  try { store.set('contentIcons', JSON.stringify(iconCache)); } catch { /* ignore */ }
}

async function fetchModIcon(name) {
  if (iconCache[name]) return iconCache[name];
  if (iconPending.has(name)) return iconPending.get(name);
  const p = (async () => {
    const base = name.replace(/\.(jar|zip|rar)$/i, '');
    const queries = [base.replace(/[-_]\d.*$/, ''), base].filter(Boolean);
    for (const qRaw of queries) {
      try {
        const q = encodeURIComponent(qRaw);
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6000);
        const r = await fetch(`https://api.modrinth.com/v2/search?query=${q}&limit=1`, { cache: 'force-cache', signal: ctrl.signal });
        clearTimeout(t);
        if (r.ok) {
          const d = await r.json();
          const url = d && d.hits && d.hits[0] && d.hits[0].icon_url;
          if (url) { iconCache[name] = url; saveIconCache(); return url; }
        }
      } catch { /* sin icono */ }
    }
    return '';
  })().finally(() => iconPending.delete(name));
  iconPending.set(name, p);
  return p;
}

function renderTabs() {
  const wrap = $('modChips');
  if (!wrap) return;
  wrap.replaceChildren();
  TYPES.forEach(t => {
    const b = el('button', 'chip', t.label);
    b.type = 'button';
    b.dataset.type = t.key;
    b.setAttribute('aria-pressed', String(t.key === activeType));
    b.onclick = () => { activeType = t.key; render(); };
    wrap.append(b);
  });
}

function getRows() {
  const q = ($('modSearch')?.value || '').trim().toLowerCase();
  const list = data[activeType] || [];
  return list.filter(f => !q || f.name.toLowerCase().includes(q));
}

function updateHeader(rows) {
  const empty = $('modEmpty');
  const count = $('modCount');
  const q = ($('modSearch')?.value || '').trim();
  if (empty) {
    empty.hidden = rows.length > 0;
    empty.textContent = q ? 'Ningún mod coincide con tu búsqueda.' : 'Todavía no hay archivos en esta categoría. Se llenará al instalar el modpack.';
  }
  if (count) count.textContent = `${rows.length} archivos`;
  document.querySelectorAll('#modChips button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.type === activeType)));
}

function setLoading(on) {
  let elLoad = document.getElementById('contentLoading');
  if (!elLoad) {
    const container = $('modList');
    if (!container) return;
    elLoad = document.createElement('div');
    elLoad.id = 'contentLoading';
    elLoad.className = 'content-loading';
    elLoad.textContent = 'Cargando contenido…';
    container.parentNode.insertBefore(elLoad, container);
  }
  elLoad.hidden = !on;
}

function createTile(f, iconUrl) {
  const tile = el('span', 'mod-tile', '');
  tile.setAttribute('aria-hidden', 'true');
  if (iconUrl) {
    const img = el('img', 'mod-icon');
    img.src = iconUrl;
    img.alt = '';
    img.loading = 'lazy';
    tile.replaceChildren(img);
  } else {
    tile.textContent = f.name.trim().slice(0, 2).toUpperCase();
  }
  return tile;
}

function renderRows(rows, token) {
  const container = $('modList');
  if (!container) return;
  container.replaceChildren();
  const catLabel = activeType === 'mods' ? 'Mod' : activeType === 'resourcepacks' ? 'Resource pack' : 'Shader';

  for (const f of rows) {
    if (token !== renderToken) return;
    const c = el('article', 'mod c1');
    if (sessionNew[activeType].has(f.name)) {
      const dot = el('span', 'new-dot');
      dot.title = 'Nuevo';
      c.classList.add('is-new');
      c.append(dot);
    }
    const tile = createTile(f, activeType === 'mods' ? (iconCache[f.name] || '') : '');
    const top = el('div', 'mod-top');
    top.append(el('b', '', f.name), el('span', 'mod-ver', fmtSize(f.size || 0)));
    const body = el('div', 'mod-body');
    body.append(top, el('span', 'mod-cat', catLabel), el('p', '', ''));
    const actions = el('div', 'mod-actions');
    const removeBtn = el('button', 'ghost small', 'Eliminar');
    removeBtn.type = 'button';
    removeBtn.onclick = async () => {
      if (window.api && typeof window.api.contentRemove === 'function') {
        await window.api.contentRemove(activeType, f.name);
        await load();
        render();
      }
    };
    actions.append(removeBtn);
    body.append(actions);
    c.append(tile, body);
    container.append(c);

    // Cargar icono en segundo plano y actualizar solo este tile
    if (activeType === 'mods' && !iconCache[f.name]) {
      fetchModIcon(f.name).then((url) => {
        if (!url || token !== renderToken) return;
        const current = c.querySelector('.mod-tile');
        if (!current) return;
        const img = el('img', 'mod-icon');
        img.src = url;
        img.alt = '';
        img.loading = 'lazy';
        current.replaceChildren(img);
      }).catch(() => {});
    }
  }
  updateHeader(rows);
}

function render() {
  const token = ++renderToken;
  const rows = getRows();
  renderRows(rows, token);
}

async function refreshAndRender(showLoading = false) {
  const token = ++renderToken;
  if (showLoading) setLoading(true);
  try {
    await load();
  } finally {
    if (token === renderToken) setLoading(false);
  }
  if (token === renderToken) render();
}

export function initContentScreen() {
  renderTabs();
  const search = $('modSearch');
  if (search) {
    search.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => render(), 120);
    });
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'add-btn';
  addBtn.type = 'button';
  addBtn.textContent = '+';
  addBtn.title = 'Agregar';
  addBtn.onclick = async () => {
    if (window.api && typeof window.api.contentAdd === 'function') {
      const r = await window.api.contentAdd(activeType);
      if (r && r.added) r.added.forEach(n => sessionNew[activeType].add(n));
      await refreshAndRender(true);
    }
  };
  const toolbar = document.querySelector('.toolbar');
  if (toolbar && !toolbar.querySelector('.add-btn')) toolbar.append(addBtn);

  const nav = $('navContent');
  if (nav) {
    nav.onclick = () => {
      showScreen('s-content');
      // Cargar en segundo plano para no bloquear la navegación
      refreshAndRender(true);
    };
  }
}
