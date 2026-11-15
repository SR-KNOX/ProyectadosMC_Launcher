/* Botones de enlaces externos (barra lateral, Sobre nosotros y Opciones): Tienda y Discord (direcciones en CONFIG.links). */
import { $ } from '../utils.js';
import { CONFIG } from '../config.js';
import { openExternal } from '../services/app.js';
import { showServerToast } from './toast.js';

function bind(btnId, key, label) {
  $(btnId).onclick = () => {
    const url = CONFIG.links[key];
    if (url && openExternal(url)) return;
    showServerToast(label, `${label} todavía no está disponible. Vuelve pronto.`, 'warn', 4500);
  };
}

export function initLinks() {
  bind('navStore', 'store', 'Tienda');
  bind('navDiscord', 'discord', 'Discord');
  bind('aboutStore', 'store', 'Tienda');
  bind('aboutDiscord', 'discord', 'Discord');
  bind('btnNickTicket', 'discord', 'Discord');   // ticket para cambiar el nombre (Opciones)
}
