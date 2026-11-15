/* Validaciones de entrada compartidas entre pantallas. */
import { CONFIG } from './config.js';

export const isValidNick = v => CONFIG.nick.pattern.test(v);

export const nickErrorMessage = () =>
  `El nick debe tener de ${CONFIG.nick.min} a ${CONFIG.nick.max} caracteres: letras, números o guion bajo.`;
