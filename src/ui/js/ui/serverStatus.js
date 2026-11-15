/* Estado del servidor: actualiza la tarjeta del inicio y avisa cuando cambia. */
import { $ } from '../utils.js';
import { CONFIG } from '../config.js';
import { state } from '../state.js';
import { checkServer } from '../services/server.js';
import { showServerToast } from './toast.js';

const LABEL = { online: 'En línea', maintenance: 'Mantenimiento', offline: 'Fuera de línea', checking: 'Comprobando…' };

// Aviso al cambiar de estado: [título, texto, tono]
const NOTE = {
  online: ['Servidor en línea', 'El servidor ya está disponible. ¡Entra a jugar!', 'ok'],
  maintenance: ['Servidor en mantenimiento', 'El servidor está en mantenimiento. Vuelve en un rato.', 'warn'],
  offline: ['Servidor fuera de línea', 'No se puede conectar con el servidor por ahora.', 'err'],
};

let last = null;

function render(status, info) {
  $('srvCard').dataset.status = status;
  $('srvState').textContent = LABEL[status];
  $('srvPlayers').textContent = status === 'online' && info ? `${info.players}/${info.max}` : '';
  $('srvCard').title = `${CONFIG.server.name}: ${LABEL[status]}` + (status === 'online' && info ? ` · ${info.players} de ${info.max} jugadores` : '');
}

export async function refreshServer() {
  if (window.__gameRunning) return;
  let r;
  try { r = await checkServer(); } catch { r = { status: 'offline', players: 0, max: 0 }; }
  render(r.status, r);
  // Avisa solo si cambió respecto a la consulta anterior y el jugador ya terminó la configuración inicial
  if (last && last !== r.status && state.nick && state.folder) {
    showServerToast(...NOTE[r.status]);
  }
  last = r.status;
}

export function initServerStatus() {
  render('checking');
  refreshServer();
  setInterval(refreshServer, CONFIG.server.pollMs);
}
