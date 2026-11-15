/* Bienvenida: nombre de jugador, carpeta de instalación, RAM e instalación inicial. */
import { $ } from '../utils.js';
import { CONFIG } from '../config.js';
import { state } from '../state.js';
import { store } from '../storage.js';
import { getInstallSteps, pickFolder } from '../services/installer.js';
import { goHome } from './home.js';
import { showServerToast } from '../ui/toast.js';
import { showScreen } from '../router.js';
import { isValidNick, nickErrorMessage } from '../validators.js';
import { bindRam } from '../ui/ram.js';
import { getTotalRamGB } from '../services/system.js';

function confirmDialog(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:grid;place-items:center;z-index:9999;';
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--surface);border:1px solid var(--edge);border-radius:var(--radius);padding:1.2rem;max-width:24rem;color:var(--text);';
    box.innerHTML = `<p style="margin-bottom:1rem">${message}</p><div style="display:flex;gap:.5rem;justify-content:flex-end"><button class="ghost" id="cCancel">Cancelar</button><button class="big" id="cOk">Continuar</button></div>`;
    overlay.append(box);
    document.body.append(overlay);
    box.querySelector('#cCancel').onclick = () => { overlay.remove(); resolve(false); };
    box.querySelector('#cOk').onclick = () => { overlay.remove(); resolve(true); };
  });
}

export function startFlow(opts = {}) {
  const reinstall = !!opts.reinstall;
  state.installMode = reinstall ? 'reinstall' : 'install';
  $('nick').value = state.nick || '';
  $('folder').value = reinstall ? '' : (state.folder || '');
  $('folderHint').textContent = reinstall ? 'Elige una carpeta para reinstalar la instancia.' : '';
  $('folderHint').className = 'hint';
  $('nickHint').textContent = '';
  $('nickHint').className = 'hint';
  const kicker = $('installKicker');
  const title = $('installTitle');
  const sub = $('installSub');
  const btn = $('btnInstall');
  const cancel = $('btnInstallCancel');
  if (reinstall) {
    if (kicker) kicker.textContent = 'Reinstalación';
    if (title) title.textContent = 'Reinstalar instancia';
    if (sub) sub.textContent = 'Se volverá a pedir la carpeta y se instalarán/verificarán los archivos necesarios.';
    if (btn) btn.textContent = 'Reinstalar';
    if (cancel) cancel.hidden = false;
  } else {
    if (kicker) kicker.textContent = 'Configuración inicial';
    if (title) title.textContent = 'Instalar instancia';
    if (sub) sub.textContent = 'Define tu nombre, la carpeta y la RAM. Todo se instalará y verificará automáticamente.';
    if (btn) btn.textContent = 'Instalar';
    if (cancel) cancel.hidden = true;
  }
  $('installProgress').classList.remove('show');
  $('status').textContent = '';
  $('barFill').style.width = '0%';
  $('installProgressPct').textContent = '0%';

  if (!reinstall && state.nick && state.folder) {
    goHome();
  } else {
    showScreen('s-folder');
  }
}

export function initFolderScreen() {
  const ram = bindRam('inst', state.ram);

  const btnCancel = $('btnInstallCancel');
  if (btnCancel) {
    btnCancel.onclick = () => {
      // Volver al inicio si ya hay una instancia configurada; si no, quedarse en instalación inicial
      if (state.nick && state.folder) goHome(); else startFlow();
    };
  }

  $('btnPick').onclick = async () => {
    const p = await pickFolder();
    if (p) {
      $('folder').value = p;
      $('folderHint').textContent = '';
      $('folderHint').className = 'hint';
    }
  };

  $('btnInstall').onclick = async () => {
    const nick = $('nick').value.trim();
    $('nickHint').textContent = '';
    if (!isValidNick(nick)) {
      $('nickHint').textContent = nickErrorMessage();
      $('nickHint').className = 'hint err';
      $('nick').focus();
      return;
    }
    if (!$('folder').value) {
      $('folderHint').textContent = 'Elige una carpeta antes de instalar.';
      $('folderHint').className = 'hint err';
      return;
    }
    state.nick = nick;
    store.set(CONFIG.storageKeys.nick, nick);
    state.folder = $('folder').value;
    store.set(CONFIG.storageKeys.folder, state.folder);
    const prevRam = state.ram;
    const nextRam = ram.get();
    const total = getTotalRamGB() || 8;
    if (nextRam > total * 0.8) {
      const ok = await confirmDialog('Estás usando más del 80 % de tu RAM. ¿Estás seguro de continuar?');
      if (!ok) { ram.set(prevRam); state.ram = prevRam; return; }
    }
    state.ram = nextRam;
    store.set(CONFIG.storageKeys.ram, String(state.ram));
    store.set('ramManual', '0');
    if (window.api && typeof window.api.saveProfile === 'function') {
      window.api.saveProfile({ folder: state.folder, ram: String(state.ram), nick: state.nick, ramManual: false });
    }

    const locked = ['btnInstall', 'instRamRange', 'btnPick', 'nick'].map($);
    locked.forEach(el => { if (el) el.disabled = true; });
    const progressWrap = $('installProgress');
    const pctEl = $('installProgressPct');
    const titleEl = $('installProgressTitle');
    const barFill = $('barFill');
    const statusEl = $('status');
    let visualPct = 0;
    let targetPct = 0;
    let raf = null;
    const renderProgress = () => {
      const shown = Math.max(visualPct, targetPct);
      barFill.style.width = shown + '%';
      pctEl.textContent = Math.round(shown) + '%';
    };
    const tick = () => {
      // Animación suave hacia el objetivo real + avance lento mientras hay trabajo
      if (visualPct < targetPct) visualPct += Math.max(0.4, (targetPct - visualPct) * 0.18);
      else if (targetPct < 99) visualPct = Math.min(targetPct + 0.35, visualPct + 0.08, 99);
      renderProgress();
      raf = requestAnimationFrame(tick);
    };
    const setProgress = (pct, text, title) => {
      if (typeof pct === 'number' && isFinite(pct)) targetPct = Math.max(targetPct, Math.min(100, pct));
      if (text) statusEl.textContent = text;
      if (title && titleEl) titleEl.textContent = title;
      renderProgress();
    };
    progressWrap.classList.add('show');
    setProgress(1, 'Preparando instalación…', 'Instalación en curso');
    raf = requestAnimationFrame(tick);

    // Progreso desde el backend (registrar una sola vez, con handler mutable por intento)
    window.__folderSetProgress = (d) => { if (d) setProgress(d.pct, d.text); };
    if (window.api && typeof window.api.on === 'function' && !window.__folderProgressBound) {
      window.__folderProgressBound = true;
      window.api.on('install:progress', (d) => {
        if (typeof window.__folderSetProgress === 'function') window.__folderSetProgress(d);
      });
    }

    try {
      if (window.api && typeof window.api.installInstance === 'function') {
        const res = await window.api.installInstance({ dir: state.folder, nick: state.nick, ramGB: state.ram });
        if (!res || res.ok === false) throw new Error((res && res.error) || 'Instalación fallida');
        setProgress(100, 'Instalación completada.', 'Listo');
        state.local = res.version || state.local;
        store.set(CONFIG.storageKeys.folder, state.folder);
        // Bloquear el cambio de nombre una vez instalado
        state.played = true;
        store.set(CONFIG.storageKeys.played, '1');
        if (window.api && typeof window.api.saveProfile === 'function') {
          window.api.saveProfile({ nick: state.nick, folder: state.folder, ram: String(state.ram), played: true });
        }
        if (window.api && typeof window.api.optimizeEnvironment === 'function') {
          window.api.optimizeEnvironment().then((r) => {
            if (!r || r.cancelled) return;
            const resOpt = (r && r.results) || {};
            const notes = Array.isArray(r.notes) ? r.notes.filter(Boolean) : [];
            let msg = `Defender ${resOpt.defender ? 'OK' : 'fallo'} · GPU ${resOpt.gpu ? 'OK' : 'fallo'} · Energía ${resOpt.power ? 'OK' : 'fallo'}.`;
            if (notes.length) msg += ' ' + notes.join(' ');
            showServerToast('Optimización del entorno', msg, (resOpt.defender && resOpt.gpu && resOpt.power) ? 'ok' : 'warn', 8000);
          }).catch((e) => {
            showServerToast('Optimización del entorno', 'No se pudo optimizar: ' + (e && e.message ? e.message : 'error desconocido'), 'err');
          });
        }
      } else {
        // Fallback dev: simular pasos
        const steps = getInstallSteps();
        for (let i = 0; i < steps.length; i++) {
          setProgress(((i + 1) / steps.length) * 100, steps[i]);
          await new Promise(r => setTimeout(r, CONFIG.timing.stepDelay));
        }
        state.played = true;
        store.set(CONFIG.storageKeys.played, '1');
      }
      if (raf) cancelAnimationFrame(raf);
      visualPct = 100; targetPct = 100; renderProgress();
      await new Promise(r => setTimeout(r, 350));
      goHome();
    } catch (err) {
      if (raf) cancelAnimationFrame(raf);
      locked.forEach(el => { if (el) el.disabled = false; });
      if (titleEl) titleEl.textContent = 'Instalación interrumpida';
      statusEl.textContent = (err && err.message) ? err.message : 'No se pudo completar la instalación. Inténtalo de nuevo.';
    }
  };
  $('nick').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnInstall').click(); });
}