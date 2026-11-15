// ============================================================
//  Extracción de ZIP con comprobaciones de seguridad.
//  extract-zip crea enlaces simbólicos y acepta nombres con ".."
//  (valida la carpeta destino, no la entrada). Aquí se rechazan
//  las entradas que podrían escribir fuera del destino.
// ============================================================
const path = require("path");
const extractZip = require("extract-zip");

const UNIX_FILE_TYPE = 0xf000;
const UNIX_SYMLINK = 0xa000;

function normalizeEntryName(name) {
  return String(name || "").replace(/\\/g, "/");
}

/* ¿El nombre de la entrada es relativo y se queda dentro del destino? */
function isSafeZipEntry(name) {
  if (typeof name !== "string" || !name || name.includes("\0")) return false;
  const normalized = normalizeEntryName(name);
  if (normalized.startsWith("/")) return false;
  if (/^[a-zA-Z]:/.test(normalized)) return false;
  return !normalized.split("/").some((part) => part === "..");
}

/* Los permisos Unix del ZIP viven en los 16 bits altos de externalFileAttributes. */
function isSymlinkEntry(entry) {
  const mode = ((entry && entry.externalFileAttributes) >> 16) & 0xffff;
  return (mode & UNIX_FILE_TYPE) === UNIX_SYMLINK;
}

async function extractZipSafe(zipPath, destDir) {
  const dest = path.resolve(destDir);
  return extractZip(zipPath, {
    dir: dest,
    onEntry(entry) {
      const name = entry && entry.fileName;
      if (!isSafeZipEntry(name)) {
        throw new Error(`Entrada ZIP no segura: ${name}`);
      }
      if (isSymlinkEntry(entry)) {
        throw new Error(`El ZIP contiene un enlace simbólico no permitido: ${name}`);
      }
      const target = path.resolve(dest, normalizeEntryName(name));
      const rel = path.relative(dest, target);
      if (rel && (rel.startsWith("..") || path.isAbsolute(rel))) {
        throw new Error(`Entrada ZIP fuera del destino: ${name}`);
      }
    },
  });
}

module.exports = { extractZipSafe, isSafeZipEntry, isSymlinkEntry };
