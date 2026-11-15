// ============================================================
//  Actualización basada en manifiesto (mods + config)
// ============================================================
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { assertAllowedUrl, fetchAllowed } = require("./net");

const CONCURRENCY = 4;

// POLÍTICA OFICIAL (v0.2.3+) — la sincronización es SOLO de mods:
// el campo 'config' del manifiesto es informativo/legacy y se IGNORA
// deliberadamente. Los configs son del jugador: nunca se descargan,
// nunca se sobrescriben, nunca cuentan como "falta/cambia" y nunca
// se reparan. La autoridad es el servidor, no el cliente.
function isDir(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/* Ruta relativa segura: sin unidad, sin absolutas y sin "..". */
function isSafeRelPath(rel) {
  if (typeof rel !== "string" || !rel.trim() || rel.includes("\0")) return false;
  const normalized = rel.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) return false;
  return !normalized.split("/").some((part) => part === ".." || part.includes(":"));
}

/* Resuelve una ruta relativa y comprueba que siga dentro de root. */
function resolveInside(root, rel) {
  const base = path.resolve(root);
  const target = path.resolve(base, String(rel).replace(/\\/g, "/"));
  const relative = path.relative(base, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Ruta fuera de la instancia: ${rel}`);
  }
  return target;
}

function validateManifestEntries(m) {
  for (const entry of m.mods.concat(m.configs)) {
    if (!entry || !isSafeRelPath(entry.file)) {
      throw new Error(`El manifiesto contiene una ruta no válida: ${entry && entry.file}`);
    }
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest("hex");
}

function readCache(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, ".pmc-cache.json"), "utf8"));
  } catch {
    return { files: {} };
  }
}

function writeCache(dir, cache) {
  try { fs.writeFileSync(path.join(dir, ".pmc-cache.json"), JSON.stringify(cache, null, 2), "utf8"); } catch { /* ignorar */ }
}

function cachedHash(dir, rel, cache) {
  const full = path.join(dir, rel);
  if (!fs.existsSync(full)) return null;
  const st = fs.statSync(full);
  const c = cache.files && cache.files[rel];
  if (c && c.size === st.size && c.mtime === st.mtimeMs) return c.hash;
  const h = sha256File(full);
  cache.files = cache.files || {};
  cache.files[rel] = { size: st.size, mtime: st.mtimeMs, hash: h };
  return h;
}

async function fetchManifest(cfg) {
  const url = cfg && (cfg.manifestUrl || cfg.manifestURL);
  if (!url) throw new Error("No hay URL de manifiesto configurada.");
  assertAllowedUrl(url, "manifiesto");
  const bust = url + (url.includes("?") ? "&" : "?") + "_=" + Date.now();
  const res = await fetchAllowed(bust, { cache: "no-store", headers: { "User-Agent": "pmc-launcher" } });
  if (!res.ok) throw new Error(`Manifiesto HTTP ${res.status}`);
  const data = await res.json();
  if (data && data.content && data.encoding === "base64") {
    const buf = Buffer.from(data.content, "base64");
    return JSON.parse(buf.toString("utf8"));
  }
  return data;
}

function normalizeManifest(manifest) {
  const mods = Array.isArray(manifest.mods) ? manifest.mods : [];
  // POLÍTICA (v0.2.3+): los configs NO se gestionan aunque el manifiesto los traiga.
  // Se ignoran por completo: el jugador es dueño de su carpeta config/.
  return { version: manifest.version || "", mods, configs: [] };
}

function listLocalFiles(dir, sub) {
  const base = path.join(dir, sub);
  if (!fs.existsSync(base)) return [];
  const out = [];
  const walk = (cur, prefix) => {
    for (const name of fs.readdirSync(cur)) {
      if (name.startsWith(".")) continue;
      const full = path.join(cur, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full, prefix + name + "/");
      else out.push(prefix + name);
    }
  };
  walk(base, "");
  return out;
}

function findEntry(list, file) {
  return list.find((e) => e.file === file);
}

/* ¿Este archivo local fue instalado por el pack en la última comprobación?
   El manifiesto solo gestiona los archivos que él declara; los mods que el
   usuario copia manualmente NUNCA pasan por la caché, así que la caché es
   la forma exacta de distinguir un mod del pack (y borrar solo si el pack
   lo retiró) de un mod propio del usuario. */
function wasPackInstalled(rel, cache) {
  const key = rel.replace(/\\/g, "/").toLowerCase();
  const files = (cache && cache.files) || {};
  for (const k of Object.keys(files)) {
    if (k.replace(/\\/g, "/").toLowerCase() === key) return true;
  }
  return false;
}

function computeDiff(manifest, instanceDir) {
  const m = normalizeManifest(manifest);

  // Sin una carpeta de instancia absoluta y existente no se escanea nada:
  // path.join("", "mods") acabaría leyendo el directorio de trabajo.
  if (typeof instanceDir !== "string" || !instanceDir.trim() || !path.isAbsolute(instanceDir) || !isDir(instanceDir)) {
    return {
      version: m.version,
      mods: { add: [], update: [], remove: [], unchanged: [], extra: [] },
      configs: { add: [], update: [], remove: [], unchanged: [], forced: [] },
      summary: {
        mods: { new: 0, updated: 0, removed: 0, unchanged: 0, extra: 0 },
        config: { new: 0, updated: 0, removed: 0, unchanged: 0 },
      },
      manifest: m,
      noInstance: true,
    };
  }

  validateManifestEntries(m);
  const cache = readCache(instanceDir);

  // Mods
  const localMods = listLocalFiles(instanceDir, "mods");
  const manifestModFiles = new Set(m.mods.map((e) => e.file));
  const mods = { add: [], update: [], remove: [], unchanged: [], extra: [] };
  for (const e of m.mods) {
    if (!localMods.includes(e.file)) mods.add.push(e.file);
    else {
      const h = cachedHash(instanceDir, path.join("mods", e.file), cache);
      if (h && e.sha256 && h.toLowerCase() !== String(e.sha256).toLowerCase()) mods.update.push(e.file);
      else mods.unchanged.push(e.file);
    }
  }
  for (const f of localMods) {
    if (!manifestModFiles.has(f)) {
      // Clasificación correcta:
      //   · En caché => el pack lo trajo la última vez y ya no está en el manifiesto
      //     => el pack lo retiró: se desinstala en la actualización.
      //   · Fuera de caché => el usuario lo copió a mano => no se toca, no es
      //     motivo de aviso.
      if (wasPackInstalled("mods/" + f, cache)) mods.remove.push(f);
      else mods.extra.push(f);
    }
  }

  // Config
  const localConfigs = listLocalFiles(instanceDir, "config");
  const manifestConfigFiles = new Set(m.configs.map((e) => e.file));
  const configs = { add: [], update: [], remove: [], unchanged: [], forced: [] };
  for (const e of m.configs) {
    const rel = e.file; // relative to instance root, e.g. config/foo.toml
    const localRel = rel.startsWith("config/") ? rel : path.join("config", rel);
    const localFileRel = localRel.replace(/\\/g, "/");
    const exists = fs.existsSync(path.join(instanceDir, localFileRel));
    if (!exists) configs.add.push(e.file);
    else {
      const h = cachedHash(instanceDir, localFileRel, cache);
      if (h && e.sha256 && h.toLowerCase() !== String(e.sha256).toLowerCase()) {
        if (e.force) { configs.update.push(e.file); configs.forced.push(e.file); }
        else configs.update.push(e.file); // se decide aplicar o no en apply
      } else configs.unchanged.push(e.file);
    }
  }
  for (const f of localConfigs) {
    const rel = path.join("config", f).replace(/\\/g, "/");
    if (!manifestConfigFiles.has(rel) && !manifestConfigFiles.has(f)) configs.remove.push(rel);
  }

  writeCache(instanceDir, cache);

  const summary = {
    mods: { new: mods.add.length, updated: mods.update.length, removed: mods.remove.length, unchanged: mods.unchanged.length, extra: mods.extra.length },
    config: { new: configs.add.length, updated: configs.update.length, removed: configs.remove.length, unchanged: configs.unchanged.length },
  };

  return { version: m.version, mods, configs, summary, manifest: m };
}

async function downloadOne(url, destTmp) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    let timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetchAllowed(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        clearTimeout(timer);
        timer = setTimeout(() => controller.abort(), 30000);
        chunks.push(Buffer.from(value));
      }
      clearTimeout(timer);
      const buf = Buffer.concat(chunks);
      fs.writeFileSync(destTmp, buf);
      return buf;
    } catch (err) {
      clearTimeout(timer);
      try { if (fs.existsSync(destTmp)) fs.unlinkSync(destTmp); } catch { /* ignore */ }
      lastErr = err;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastErr;
}

async function applyManifest(manifest, instanceDir, onProgress) {
  const m = normalizeManifest(manifest);
  if (typeof instanceDir !== "string" || !path.isAbsolute(instanceDir) || !isDir(instanceDir)) {
    throw new Error("No hay una instancia válida para aplicar el manifiesto.");
  }
  validateManifestEntries(m);
  const diff = computeDiff(manifest, instanceDir);
  const modsDir = path.join(instanceDir, "mods");
  const configDir = path.join(instanceDir, "config");
  fs.mkdirSync(modsDir, { recursive: true });
  fs.mkdirSync(configDir, { recursive: true });

  // Limpieza de .tmp residuales al iniciar
  try {
    for (const f of fs.readdirSync(modsDir)) if (f.endsWith(".tmp")) fs.unlinkSync(path.join(modsDir, f));
  } catch { /* ignore */ }
  try {
    for (const f of fs.readdirSync(configDir)) if (f.endsWith(".tmp")) fs.unlinkSync(path.join(configDir, f));
  } catch { /* ignore */ }

  // Build download tasks
  const tasks = [];
  const taskMeta = [];

  for (const file of diff.mods.add.concat(diff.mods.update)) {
    const entry = findEntry(m.mods, file);
    if (!entry || !entry.url) continue;
    assertAllowedUrl(entry.url, file);
    const target = resolveInside(modsDir, file);
    const tmp = target + ".tmp";
    tasks.push(async () => {
      const buf = await downloadOne(entry.url, tmp);
      if (entry.size && buf.length !== entry.size) {
        throw new Error(`Tamaño no coincide para ${file}`);
      }
      if (entry.sha256) {
        const h = crypto.createHash("sha256").update(buf).digest("hex");
        if (h.toLowerCase() !== String(entry.sha256).toLowerCase()) {
          throw new Error(`Hash no coincide para ${file}`);
        }
      }
      try { if (fs.existsSync(target)) fs.unlinkSync(target); } catch { /* */ }
      fs.renameSync(tmp, target);
    });
    taskMeta.push({ file, type: "mod", tmp });
  }

  // Config downloads (add + forced update; normal update if not forced? apply only forced to respect local changes)
  const configToDownload = diff.configs.add.slice();
  for (const file of diff.configs.update) {
    const entry = findEntry(m.configs, file);
    if (entry && entry.force) configToDownload.push(file);
  }
  // For forced update entries, entry.file may be in update list; ensure included
  for (const file of diff.configs.update) {
    const entry = findEntry(m.configs, file);
    if (entry && entry.force && !configToDownload.includes(file)) configToDownload.push(file);
  }

  for (const file of configToDownload) {
    const entry = findEntry(m.configs, file);
    if (!entry || !entry.url) continue;
    assertAllowedUrl(entry.url, file);
    const rel = file.startsWith("config/") ? file : path.join("config", file);
    const localRel = rel.replace(/\\/g, "/");
    const target = resolveInside(instanceDir, localRel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = target + ".tmp";
    tasks.push(async () => {
      const buf = await downloadOne(entry.url, tmp);
      if (entry.size && buf.length !== entry.size) {
        throw new Error(`Tamaño no coincide para ${file}`);
      }
      if (entry.sha256) {
        const h = crypto.createHash("sha256").update(buf).digest("hex");
        if (h.toLowerCase() !== String(entry.sha256).toLowerCase()) {
          throw new Error(`Hash no coincide para ${file}`);
        }
      }
      try { if (fs.existsSync(target)) fs.unlinkSync(target); } catch { /* */ }
      fs.renameSync(tmp, target);
    });
    taskMeta.push({ file, type: "config", tmp });
  }

  const total = tasks.length;
  let done = 0;
  const errors = [];
  // Run with concurrency
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      try {
        await tasks[i]();
      } catch (err) {
        const meta = taskMeta[i];
        if (meta && meta.tmp) {
          try { if (fs.existsSync(meta.tmp)) fs.unlinkSync(meta.tmp); } catch { /* ignore */ }
        }
        errors.push({ meta, error: String(err && err.message ? err.message : err) });
      }
      done++;
      if (onProgress) {
        const frac = total ? done / total : 1;
        const text = errors.length
          ? `Error en ${errors[errors.length - 1].meta.file}`
          : `Descargando ${done}/${total}…`;
        onProgress(frac, text);
      }
    }
  }
  const workers = Array.from({ length: Math.min(CONCURRENCY, tasks.length || 1) }, () => worker());
  await Promise.all(workers);

  if (errors.length) {
    try { writeCache(instanceDir, readCache(instanceDir)); } catch { /* ignore */ }
    const details = errors.map((e) => `${e.meta.file}: ${e.error}`).join(" | ");
    throw new Error(`Falló la descarga de: ${details}`);
  }

  // Desinstalar SOLO los mods que el pack retiró (estaban en la caché).
  // Los mods del jugador (fuera de caché) permanecen intocables.
  for (const file of diff.mods.remove) {
    const target = resolveInside(modsDir, file);
    try { if (fs.existsSync(target)) fs.unlinkSync(target); } catch { /* */ }
  }
  // IMPORTANTE: los configs que ya no están en el manifiesto NO se borran.
  // El jugador conserva sus archivos locales (ajustes, teclas, configs de mods
  // retirados, etc.). El manifiesto solo gestiona los que él declara.

  const cache = readCache(instanceDir);
  try {
    for (const e of m.mods) {
      const rel = path.join("mods", e.file).replace(/\\/g, "/");
      if (fs.existsSync(path.join(instanceDir, rel))) {
        const st = fs.statSync(path.join(instanceDir, rel));
        cache.files = cache.files || {};
        cache.files[rel] = { size: st.size, mtime: st.mtimeMs, hash: e.sha256 || sha256File(path.join(instanceDir, rel)) };
      }
    }
    for (const e of m.configs) {
      const rel = (e.file.startsWith("config/") ? e.file : path.join("config", e.file)).replace(/\\/g, "/");
      if (fs.existsSync(path.join(instanceDir, rel))) {
        const st = fs.statSync(path.join(instanceDir, rel));
        cache.files = cache.files || {};
        cache.files[rel] = { size: st.size, mtime: st.mtimeMs, hash: e.sha256 || sha256File(path.join(instanceDir, rel)) };
      }
    }
  } finally {
    writeCache(instanceDir, cache);
  }
  return { version: m.version, summary: diff.summary };
}

module.exports = { fetchManifest, computeDiff, applyManifest, normalizeManifest };
