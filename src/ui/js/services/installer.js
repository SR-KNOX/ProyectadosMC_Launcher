/* Servicio de instalación (Java, Forge, mods, configuración). */
import { CONFIG } from '../config.js';

export function getInstallSteps() {
  return [
    `Preparando Java ${CONFIG.game.javaVersion}…`,
    `Instalando Forge ${CONFIG.game.minecraftVersion}…`,
    'Descargando mods…',
    'Descargando configuración…',
    'Listo',
  ];
}

/* Selector de carpeta (diálogo nativo de Electron; fuera de Electron no hay selector). */
export async function pickFolder() {
  if (window.api && typeof window.api.pickFolder === 'function') {
    const p = await window.api.pickFolder();
    return p || '';
  }
  return '';
}