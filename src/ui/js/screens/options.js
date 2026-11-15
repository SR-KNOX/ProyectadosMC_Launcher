/* Pantalla de opciones: nombre de jugador, skin, capa, carpeta y memoria RAM. */
import { $ } from '../utils.js';
import { CONFIG } from '../config.js';
import { state } from '../state.js';
import { store } from '../storage.js';
import { showScreen } from '../router.js';
import { renderProfile, renderInfo } from './home.js';
import { isValidNick, nickErrorMessage } from '../validators.js';
import { bindRam } from '../ui/ram.js';
import { getTotalRamGB } from '../services/system.js';
import { setSkinFromFile, clearSkin, setSkinModel, drawBody, setCapeFromFile, clearCape, drawCape } from '../services/skin.js';
import { startFlow } from './folder.js';

function nickMsg(text) { const h = $('nickChangeHint'); h.textContent = text; h.className = 'hint ' + (text ? 'err' : ''); }

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
function closeNickForm() {
  $('nickForm').hidden = true;
  $('btnNickEdit').setAttribute('aria-expanded', 'false');
  $('nickNew').value = '';
  nickMsg('');
}

function openOptions() {
  closeNickForm();
  $('optNick').value = state.nick || '';
  // Si ya entró al servidor, el cambio de nombre se pide por ticket en Discord
  $('btnNickEdit').hidden = state.played;
  $('nickLocked').hidden = !state.played;
  $('optFolder').value = state.folder || '';
  optRam.set(state.ram);
  $('optHint').textContent = '';
  $('optHint').className = 'hint';
  $('skinHint').textContent = '';
  $('skinHint').className = 'hint';
  $('capeHint').textContent = '';
  $('capeHint').className = 'hint';
  renderSkinPreview();
  renderCapePreview();
  showScreen('s-options');
}

/* Vista previa de la skin; si no hay, un recuadro vacío. */
async function renderSkinPreview() {
  const c = $('skinPreview');
  document.querySelectorAll('input[name="skinModel"]').forEach(r => { r.checked = r.value === state.skinModel; });
  $('btnSkinClear').disabled = !state.skin;
  if (!state.skin) { c.getContext('2d').clearRect(0, 0, 16, 32); c.classList.add('empty'); return; }
  c.classList.remove('empty');
  try { await drawBody(c, state.skin, state.skinModel === 'slim'); } catch { /* skin dañada */ }
}

/* Vista previa de la capa (vista de espaldas); si no hay, un recuadro vacío. */
async function renderCapePreview() {
  const c = $('capePreview');
  $('btnCapeClear').disabled = !state.cape;
  if (!state.cape) { c.getContext('2d').clearRect(0, 0, 10, 16); c.classList.add('empty'); return; }
  c.classList.remove('empty');
  try { await drawCape(c, state.cape); } catch { /* capa dañada */ }
}

function capeMsg(text, cls) { const h = $('capeHint'); h.textContent = text; h.className = 'hint ' + cls; }
function skinMsg(text, cls) { const h = $('skinHint'); h.textContent = text; h.className = 'hint ' + cls; }

let optRam;

export function initOptionsScreen() {
  optRam = bindRam('opt', state.ram);
  $('btnOptions').onclick = openOptions;
  $('btnOptBack').onclick = () => { renderInfo(); showScreen('s-home'); };

  const btnReinstall = $('btnOptReinstall');
  if (btnReinstall) {
    btnReinstall.onclick = async () => {
      const ok = await confirmDialog('¿Reinstalar la instancia? Podrás elegir la carpeta de instalación y se verificarán/instalarán los archivos necesarios. Tu nombre, skin y ajustes se conservarán.');
      if (!ok) return;
      startFlow({ reinstall: true });
    };
  }

  $('btnOptSave').onclick = async () => {
    const newVal = optRam.get();
    const total = getTotalRamGB() || 8;
    if (newVal > total * 0.8) {
      const ok = await confirmDialog('Estás usando más del 80 % de tu RAM. ¿Estás seguro de continuar?');
      if (!ok) { optRam.set(state.ram); return; }
    }
    state.ram = newVal;
    store.set(CONFIG.storageKeys.ram, String(state.ram));
    store.set('ramManual', '1');
    if (window.api && typeof window.api.saveProfile === 'function') {
      window.api.saveProfile({ folder: state.folder, ram: String(state.ram), nick: state.nick, ramManual: true });
    }
    $('optHint').textContent = 'Cambios guardados.';
    $('optHint').className = 'hint ok';
  };
  // Cambiar el nombre de jugador (solo mientras no haya entrado al servidor)
  $('btnNickEdit').onclick = () => {
    if (!$('nickForm').hidden) return closeNickForm();
    $('nickForm').hidden = false;
    $('btnNickEdit').setAttribute('aria-expanded', 'true');
    $('nickNew').focus();
  };
  $('btnNickCancel').onclick = () => { closeNickForm(); $('btnNickEdit').focus(); };
  $('nickForm').onsubmit = e => {
    e.preventDefault();
    const nick = $('nickNew').value.trim();
    if (state.played) { closeNickForm(); $('btnNickEdit').hidden = true; $('nickLocked').hidden = false; return; }
    if (!isValidNick(nick)) return nickMsg(nickErrorMessage());
    if (nick === state.nick) return nickMsg('Ese ya es tu nombre de jugador.');
    state.nick = nick;
    store.set(CONFIG.storageKeys.nick, nick);
    $('optNick').value = nick;
    renderProfile();
    closeNickForm();
    $('optHint').textContent = `Nombre cambiado. Ahora te llamas ${nick}.`;
    $('optHint').className = 'hint ok';
  };

  const persistProfile = patch => {
    if (window.api && typeof window.api.saveProfile === 'function') {
      try { window.api.saveProfile(patch); } catch { /* sin perfil disponible */ }
    }
  };
  $('btnSkinPick').onclick = () => $('skinFile').click();
  $('skinFile').onchange = async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      await setSkinFromFile(f);
      await renderSkinPreview();
      renderProfile();
      persistProfile({ skin: state.skin, skinModel: state.skinModel });
      skinMsg('Skin guardada en este equipo. Se verá en el juego al entrar.', 'ok');
    } catch (err) { skinMsg(err.message, 'err'); }
  };
  $('btnSkinClear').onclick = () => { clearSkin(); renderSkinPreview(); renderProfile(); persistProfile({ skin: '' }); skinMsg('Skin quitada.', 'ok'); };
  $('btnCapePick').onclick = () => $('capeFile').click();
  $('capeFile').onchange = async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      await setCapeFromFile(f);
      await renderCapePreview();
      capeMsg('Capa guardada en este equipo. Se verá en el juego al entrar.', 'ok');
      persistProfile({ cape: state.cape });
    } catch (err) { capeMsg(err.message, 'err'); }
  };
  $('btnCapeClear').onclick = () => { clearCape(); renderCapePreview(); persistProfile({ cape: '' }); capeMsg('Capa quitada.', 'ok'); };
  document.querySelectorAll('input[name="skinModel"]').forEach(r => {
    r.onchange = () => { setSkinModel(r.value); renderSkinPreview(); persistProfile({ skinModel: state.skinModel }); };
  });
  // Selector de perfil de rendimiento del juego
  const perfInputs = document.querySelectorAll('input[name="optPerf"]');
  const syncPerf = () => {
    perfInputs.forEach(r => { r.checked = r.value === state.perfLevel; });
    const perfHint = $('optPerfHint');
    if (perfHint) {
      const map = {
        auto: 'Automático: adapta la configuración y los flags a tu equipo.',
        low: 'Más fluido: máxima fluidez y FPS, gráficas al mínimo.',
        medium: 'Equilibrado: punto medio entre rendimiento y calidad.',
        high: 'Máxima calidad: mejor detalle, partículas y renderizado.',
      };
      perfHint.textContent = map[state.perfLevel] || map.auto;
    }
  };
  perfInputs.forEach(r => {
    r.onchange = () => {
      if (!r.checked) return;
      state.perfLevel = r.value;
      store.set(CONFIG.storageKeys.perfLevel, r.value);
      persistProfile({ perfLevel: r.value });
      syncPerf();
    };
  });
  syncPerf();

}
