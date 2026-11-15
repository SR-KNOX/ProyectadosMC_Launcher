/* Servicio de lanzamiento de Minecraft. Conectado con el backend de Electron. */
import { CONFIG } from '../config.js';
import { state } from '../state.js';
import { store } from '../storage.js';

export async function launchGame(onStatus) {
  if (window.api && typeof window.api.launch === 'function') {
    onStatus && onStatus('Iniciando Minecraft…');
    const res = await window.api.launch();
    if (!res || res.ok === false) {
      throw new Error((res && res.error) || 'No se pudo iniciar Minecraft.');
    }
    state.played = true;
    store.set(CONFIG.storageKeys.played, '1');
    onStatus && onStatus('Minecraft en ejecución');
    return;
  }
  // Fallback dev
  await new Promise(r => setTimeout(r, CONFIG.timing.launchDelay));
  state.played = true;
  store.set(CONFIG.storageKeys.played, '1');
  onStatus && onStatus('Minecraft en ejecución');
}