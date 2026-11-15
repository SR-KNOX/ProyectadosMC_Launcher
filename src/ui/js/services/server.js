/* Servicio de estado del servidor de juego. Consulta la API pública de mcsrvstat.us.
   Si la red falla, el servidor se muestra «Fuera de línea» (nunca datos falsos). */
import { CONFIG } from '../config.js';

export async function checkServer() {
  const addr = CONFIG.server.address;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(`https://api.mcsrvstat.us/2/${encodeURIComponent(addr)}`, { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) {
      const d = await r.json();
      if (d && typeof d.online === 'boolean') {
        return {
          status: d.online ? 'online' : 'offline',
          players: (d.players && d.players.online) || 0,
          max: (d.players && d.players.max) || CONFIG.server.fallbackMaxPlayers,
        };
      }
    }
  } catch { /* mostrar fuera de línea */ }
  return { status: 'offline', players: 0, max: CONFIG.server.fallbackMaxPlayers };
}