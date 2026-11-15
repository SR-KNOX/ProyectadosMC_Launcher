/* Estado global del launcher. Único lugar donde se guarda el estado en memoria. */
import { CONFIG } from './config.js';
import { store } from './storage.js';

export const state = {
  nick: store.get(CONFIG.storageKeys.nick),
  folder: store.get(CONFIG.storageKeys.folder),
  played: store.get(CONFIG.storageKeys.played) === '1',               // ya entró al juego/servidor con este nombre
  ram: parseFloat(store.get(CONFIG.storageKeys.ram)) || CONFIG.ram.default,
  skin: store.get(CONFIG.storageKeys.skin),                          // data URL PNG o null
  cape: store.get(CONFIG.storageKeys.cape),                          // data URL PNG o null
  skinModel: store.get(CONFIG.storageKeys.skinModel) === 'slim' ? 'slim' : 'classic',
  perfLevel: store.get(CONFIG.storageKeys.perfLevel) || 'auto',     // auto | low | medium | high (lo aplica main.js al lanzar)
  local: CONFIG.modpack.defaultLocalVersion,
  remote: CONFIG.modpack.defaultLocalVersion,
};
