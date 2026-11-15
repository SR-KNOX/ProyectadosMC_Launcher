/* Punto de entrada: inicializa módulos y decide la pantalla inicial. */
import { CONFIG } from './config.js';
import { $ } from './utils.js';
import { store } from './storage.js';
import { state } from './state.js';
import { drawBackground } from './ui/background.js';
import { initToast, showServerToast } from './ui/toast.js';
import { initLogsScreen, checkLogs } from './screens/logs.js';
import { initFolderScreen, startFlow } from './screens/folder.js';
import { initHomeScreen } from './screens/home.js';
import { initOptionsScreen } from './screens/options.js';

import { initContentScreen } from './screens/content.js';
import { initAboutScreen } from './screens/about.js';
import { initPrivacyScreen } from './screens/privacy.js';
import { initLinks } from './ui/links.js';
import { initServerStatus } from './ui/serverStatus.js';
import { initNews } from './ui/news.js';

let lastUiErrorAt = 0;
function notifyUiError() {
  const now = Date.now();
  if (now - lastUiErrorAt < 5000) return;
  lastUiErrorAt = now;
  try {
    showServerToast('Aviso', 'Ocurrió un error inesperado en la interfaz.', 'err', 6000);
  } catch { /* ignore */ }
}

window.addEventListener('error', (e) => {
  try { console.error('UI error:', e && e.message ? e.message : e); } catch { /* ignore */ }
  notifyUiError();
});
window.addEventListener('unhandledrejection', (e) => {
  try { console.error('UI unhandled rejection:', e && e.reason ? e.reason : e); } catch { /* ignore */ }
  notifyUiError();
});

async function hydrate() {
  try {
    if (window.api && typeof window.api.systemInfo === 'function') {
      const info = await window.api.systemInfo();
      window.__hardware = info;
      if (info && info.totalRamGB) window.__totalRamGB = info.totalRamGB;
      // RAM recomendada: clamp(RAM libre * 0.6, 3, 6), nunca >8
      const free = (info && info.freeRamGB) || (info && info.totalRamGB) || 8;
      let rec = free * 0.6;
      rec = Math.max(3, Math.min(6, rec));
      rec = Math.min(8, rec);
      rec = Math.round(rec * 2) / 2;
      window.__recommendedRam = rec;
    }
    if (window.api && typeof window.api.getProfile === 'function') {
      const p = await window.api.getProfile();
      if (p) {
        if (p.nick) { state.nick = p.nick; store.set(CONFIG.storageKeys.nick, p.nick); }
        if (p.folder) { state.folder = p.folder; store.set(CONFIG.storageKeys.folder, p.folder); }
        if (p.ram) { state.ram = parseFloat(p.ram); store.set(CONFIG.storageKeys.ram, String(p.ram)); }
        if (p.skin) { state.skin = p.skin; store.set(CONFIG.storageKeys.skin, p.skin); }
        if (p.skinModel) { state.skinModel = p.skinModel; store.set(CONFIG.storageKeys.skinModel, p.skinModel); }
        if (p.cape) { state.cape = p.cape; store.set(CONFIG.storageKeys.cape, p.cape); }
        if (p.played) { state.played = true; store.set(CONFIG.storageKeys.played, '1'); }
        if (p.perfLevel) { state.perfLevel = p.perfLevel; store.set(CONFIG.storageKeys.perfLevel, p.perfLevel); }
        if (p.lastModpackVersion) { state.local = p.lastModpackVersion; }
        state.instanceMissing = !!p.instanceMissing;
        state.installed = !!p.installed;
      }
      if (!store.get(CONFIG.storageKeys.ram) && window.__recommendedRam) {
        state.ram = window.__recommendedRam;
        store.set(CONFIG.storageKeys.ram, String(state.ram));
      }
    }
  } catch (e) { console.warn('Perfil no disponible', e); }
}

(async () => {
  const splashStart = Date.now();
  // Limpieza: versiones anteriores guardaban cuentas, contraseñas y sesiones en este equipo; ya no se usan
  ['accounts', 'session', 'resetReq'].forEach(k => store.del(k));

  await hydrate();

  const btnMin = document.getElementById('btnMin');
  const btnMax = document.getElementById('btnMax');
  const btnClose = document.getElementById('btnClose');
  if (btnMin) btnMin.onclick = () => window.api && window.api.minimize();
  if (btnMax) btnMax.onclick = () => window.api && window.api.maximize();
  if (btnClose) btnClose.onclick = () => window.api && window.api.close();

  $('appVer').textContent = 'v' + CONFIG.app.version;
  drawBackground();
  initToast();
  initFolderScreen();
  initHomeScreen();
  initOptionsScreen();
  initLogsScreen();
  initContentScreen();
  initAboutScreen();
  initPrivacyScreen();
  initLinks();
  initServerStatus();
  initNews();

  // Aviso de logs no vistos (independiente del modpack): punto verde + aviso "Nuevos cambios"
  checkLogs().then(has => {
    if (has) showServerToast('Nuevos cambios', 'Se publicaron notas de actualización. Échales un ojo en la pestaña Logs.', 'ok', 8000);
  }).catch(() => { /* sin internet: silencio */ });

  startFlow();

  const remaining = Math.max(0, 5000 - (Date.now() - splashStart));
  setTimeout(() => {
    const splash = document.getElementById('splash');
    if (splash) splash.classList.add('hide');
  }, remaining);
})();