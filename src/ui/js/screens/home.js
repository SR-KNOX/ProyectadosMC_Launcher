/* Pantalla 3: inicio (datos del modpack, estado, jugar / actualizar / restaurar). */
import { $ } from '../utils.js';
import { CONFIG } from '../config.js';
import { state } from '../state.js';
import { store } from '../storage.js';
import { showScreen } from '../router.js';
import { progress, resetProgress } from '../ui/progress.js';
import { showToast, hideToast } from '../ui/toast.js';
import { checkUpdate } from '../services/updater.js';
import { launchGame } from '../services/game.js';
import { drawHead } from '../services/skin.js';
import { pauseBackground } from '../ui/background.js';
import { startFlow } from './folder.js';

export function renderProfile() {
  $('hName').textContent = state.nick;
  $('avatarLetter').textContent = state.nick ? state.nick[0].toUpperCase() : 'S';
  const av = $('avatar');
  av.classList.toggle('has-skin', !!state.skin);
  if (state.skin) drawHead($('avatarSkin'), state.skin).catch(() => av.classList.remove('has-skin'));
}

function statusTextForMode(mode) {
  if (mode === 'install') return 'Instancia no instalada';
  if (mode === 'repair') return 'Faltan archivos';
  if (mode === 'update') return 'Actualización disponible';
  return 'Actualizado';
}

export function renderInfo() {
  const mode = state.homeMode || 'play';
  $('packV').textContent = 'v' + (state.local || '0.0.0');
  $('heroVer').textContent = 'v' + (state.local || '0.0.0');
  $('infoPack').textContent = 'v' + (state.local || '0.0.0');
  $('infoRam').textContent = (Number.isInteger(state.ram) ? state.ram : String(state.ram).replace('.', ',')) + ' GB';
  const st = $('infoState');
  st.textContent = statusTextForMode(mode);
  st.className = (mode === 'play') ? 'ok' : 'warn';
}

export function goHome() {
  renderProfile();
  $('heroText').textContent = CONFIG.modpack.description;
  $('mcV').textContent = CONFIG.game.minecraftVersion;
  renderInfo();
  showScreen('s-home');
  refreshInstanceState();
}

async function getInstanceStatusSafe() {
  if (window.api && typeof window.api.instanceStatus === 'function') {
    try { return await window.api.instanceStatus(); } catch { /* ignore */ }
  }
  // Fallback conservador
  return {
    folder: state.folder || '',
    folderExists: !!state.folder,
    ready: !state.instanceMissing,
    installed: !state.instanceMissing,
    needsInstall: !!state.instanceMissing || !state.folder,
    repairAvailable: !!state.instanceMissing,
    updateAvailable: false,
    localVersion: state.local || '',
    remoteVersion: state.remote || '',
    offline: false,
  };
}

export async function refreshUpdateState() { return refreshInstanceState(); }

export async function refreshInstanceState() {
  const status = await getInstanceStatusSafe();
  state.instanceStatus = status;
  state.instanceMissing = !status.ready;
  if (status.remoteVersion) state.remote = status.remoteVersion;
  if (status.localVersion) state.local = status.localVersion;

  let mode = 'play';
  if (!state.folder || !status.folderExists || status.needsInstall || !status.ready) mode = 'install';
  else if (status.repairAvailable || status.updateAvailable) {
    // Si la versión remota es distinta, es una actualización (no un "restaurar"):
    // el botón y los textos dicen "Actualizar". "Restaurar" queda reservado a
    // cuando la versión coincide pero faltan o cambiaron archivos.
    const remoteNewer = status.remoteVersion && state.local && status.remoteVersion !== state.local;
    mode = remoteNewer ? 'update' : (status.repairAvailable ? 'repair' : 'update');
  }
  state.homeMode = mode;

  const b = $('btnMain');
  const label = $('btnMainLabel');
  const s2 = $('status2');
  b.classList.remove('update');
  b.dataset.mode = mode;
  if (mode === 'install') {
    label.textContent = state.folder ? 'Reinstalar' : 'Instalar';
    b.classList.add('update');
    s2.textContent = !state.folder
      ? 'Configura tu nombre y la carpeta para instalar la instancia.'
      : 'La instancia no está completa o falta. Reinstálala para continuar.';
  } else if (mode === 'repair') {
    label.textContent = 'Restaurar';
    b.classList.add('update');
    s2.textContent = status.offline
      ? 'Faltan archivos. Conéctate a internet para restaurar el modpack.'
      : 'Se detectaron archivos faltantes o diferentes. Pulsa Restaurar.';
  } else if (mode === 'update') {
    label.textContent = 'Actualizar';
    b.classList.add('update');
    s2.textContent = status.offline
      ? 'Hay una actualización pendiente, pero no hay conexión.'
      : 'Hay una actualización del modpack disponible.';
  } else {
    label.textContent = 'Jugar';
    if (!s2.textContent || /Faltan|instancia|actualiz|Reinst|Restaur/i.test(s2.textContent)) s2.textContent = '';
  }

  renderInfo();
  hideToast();
  if (mode === 'update') {
    showToast(state.updateNotes || `Hay una actualización del modpack disponible (v${state.remote || state.local}). Pulsa Actualizar para instalarla.`);
  } else if (mode === 'repair') {
    showToast('Faltan o cambiaron archivos del modpack. Pulsa Restaurar para corregirlo automáticamente.');
  } else if (mode === 'install' && state.folder) {
    showToast('La instancia está incompleta o no existe. Pulsa Reinstalar para volver a configurarla.');
  }
}

async function runApplyFlow(modeLabel) {
  $('bar2').style.display = 'block';
  $('bar2').style.visibility = 'visible';
  $('barFill2').style.width = '0%';
  $('status2').textContent = `${modeLabel}…`;
  if (window.api && typeof window.api.applyUpdate === 'function') {
    const res = await window.api.applyUpdate();
    if (!res || res.ok === false) {
      if (res && res.needsInstall) {
        $('status2').textContent = 'La instancia base no está completa. Se requiere reinstalar.';
        startFlow({ reinstall: true });
        return { redirected: true };
      }
      throw new Error((res && res.error) || 'No se pudo completar la operación.');
    }
    state.local = res.version || state.local;
  } else {
    await progress('bar2', 'barFill2', 'status2', ['Descargando cambios…', 'Verificando archivos…', 'Listo']);
  }
  resetProgress('bar2', 'barFill2');
  await refreshInstanceState();
  return { redirected: false };
}

export function initHomeScreen() {
  // Listeners de progreso real del lanzamiento
  if (window.api && typeof window.api.on === 'function') {
    window.api.on('install:progress', d => {
      if (!d) return;
      $('bar2').style.display = 'block';
      $('bar2').style.visibility = 'visible';
      if (typeof d.pct === 'number') $('barFill2').style.width = d.pct + '%';
      if (d.text) $('status2').textContent = d.text;
    });
    window.api.on('game:launched', () => {
      $('barFill2').style.width = '100%';
      $('status2').textContent = 'Minecraft en ejecución';
    });
    window.api.on('launch:closed', () => {
      $('barFill2').style.width = '0%';
      $('bar2').style.display = 'none';
      $('bar2').style.visibility = 'hidden';
      $('status2').textContent = '';
      window.__gameRunning = false;
      // Re-verificar por si el usuario cambió archivos mientras jugaba
      refreshInstanceState();
    });
    window.api.on('launch:error', d => {
      $('status2').textContent = (d && d.message) ? d.message : 'Error al abrir Minecraft.';
    });
    window.api.on('launch:oom', d => {
      $('status2').textContent = (d && d.message) ? d.message : 'Minecraft se quedó sin memoria.';
    });
  }

  $('navHome').onclick = () => { refreshInstanceState(); showScreen('s-home'); };
  $('btnMain').onclick = async () => {
    const b = $('btnMain');
    b.disabled = true;
    try {
      const mode = state.homeMode || 'play';
      if (mode === 'install') {
        startFlow({ reinstall: !!state.folder });
        return;
      }
      if (mode === 'update' || mode === 'repair') {
        const r = await runApplyFlow(mode === 'repair' ? 'Restaurando archivos' : 'Actualizando modpack');
        if (r && r.redirected) return;
      }
      if ((state.homeMode || 'play') !== 'play') {
        $('status2').textContent = $('status2').textContent || 'Verifica la instancia antes de jugar.';
        return;
      }
      $('bar2').style.display = 'block';
      $('bar2').style.visibility = 'visible';
      $('barFill2').style.width = '0%';
      $('status2').textContent = 'Preparando Minecraft…';
      window.__gameRunning = true;
      pauseBackground();
      try {
        await launchGame(msg => { if (msg) $('status2').textContent = msg; });
      } catch (e) {
        const msg = (e && e.message) ? e.message : 'No se pudo iniciar Minecraft.';
        if (/instancia|incompleta|no existe|instalarla/i.test(msg)) {
          $('status2').textContent = 'La instancia no es válida. Debes reinstalarla.';
          await refreshInstanceState();
          startFlow({ reinstall: true });
        } else {
          throw e;
        }
      }
    } catch (e) {
      $('status2').textContent = (e && e.message) ? e.message : 'No se pudo completar la operación. Inténtalo de nuevo.';
    } finally {
      b.disabled = false;
    }
  };
}