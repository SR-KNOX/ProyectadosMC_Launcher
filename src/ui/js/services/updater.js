/* Servicio de actualización del modpack. Conectado con el backend de Electron. */
import { CONFIG } from '../config.js';

export async function checkUpdate(localVersion) {
  if (window.api && typeof window.api.checkUpdates === 'function') {
    try {
      const r = await window.api.checkUpdates();
      if (r && r.disabled) return { remote: localVersion, hasUpdate: false };
      if (r && r.noInstance) return { remote: localVersion, hasUpdate: false };
      if (r && r.offline) return { remote: localVersion, hasUpdate: false };
      const remote = r.version || localVersion;
      return { remote, hasUpdate: !!r.available, notes: r.notes || '' };
    } catch {
      return { remote: localVersion, hasUpdate: false };
    }
  }
  // Fallback web/dev
  return { remote: localVersion, hasUpdate: false };
}

export function getUpdateSteps() {
  return ['Comprobando versión…', 'Descargando cambios…', 'Verificando archivos…', 'Actualizado'];
}