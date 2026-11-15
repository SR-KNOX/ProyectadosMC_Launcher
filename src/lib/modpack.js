// ============================================================
//  DEPRECATED: este módulo es el método legacy por ZIP.
//  El flujo principal usa manifest.js (actualizaciones delta).
//  Se mantiene solo como respaldo.
// ============================================================
//  Modpack desde GitHub (repositorio PÚBLICO)
//
//  · La versión se lee de "version.json" en la raíz del repo:
//      { "version": "1.0.0", "downloadUrl": ".../mods.zip" }
//  · El ZIP se descarga como en cualquier launcher (progreso,
//    reintentos y reanudación) y se extrae sobre la instancia,
//    reemplazando la carpeta "mods" anterior.
//  · Si "version.json" no responde, se usa la última release.
// ============================================================
const fs = require("fs");
const path = require("path");
const https = require("https");
const { extractZipSafe } = require("./zip");
const { assertAllowedUrl } = require("./net");

const API = "https://api.github.com";
const UA = "ProyectadosMC-Launcher";
const TIMEOUT = 45000;      // sin datos durante 45 s -> error
const WORK_DIR = ".proyectados"; // carpeta temporal dentro de la instancia

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mb = (bytes) => (bytes / 1024 ** 2).toFixed(1).replace(".", ",");

// ------------------------------------------------------------
//  Utilidades HTTP
// ------------------------------------------------------------
function request(url, { method = "GET", headers = {} } = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    try {
      assertAllowedUrl(url, "GitHub");
    } catch (err) {
      return reject(err);
    }
    const req = https.request(
      url,
      { method, headers: { "User-Agent": UA, ...headers } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirects >= 6) return reject(new Error("Demasiadas redirecciones de GitHub."));
          return request(res.headers.location, { method, headers }, redirects + 1).then(resolve, reject);
        }
        resolve(res);
      }
    );
    req.setTimeout(TIMEOUT, () => req.destroy(new Error("GitHub no responde (tiempo de espera agotado).")));
    req.on("error", reject);
    req.end();
  });
}

async function getJSON(url) {
  const res = await request(url, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (res.statusCode === 404) {
    res.resume();
    return null;
  }
  if (res.statusCode >= 400) {
    res.resume();
    throw new Error(`GitHub respondió ${res.statusCode}.`);
  }
  let body = "";
  res.setEncoding("utf8");
  for await (const chunk of res) body += chunk;
  return JSON.parse(body);
}

/* Tamaño del archivo sin descargarlo (sigue las redirecciones de GitHub). */
function headSize(url) {
  try {
    assertAllowedUrl(url, "tamaño de la release");
  } catch {
    return Promise.resolve(0);
  }
  return new Promise((resolve) => {
    const req = https.request(
      url,
      { method: "HEAD", headers: { "User-Agent": UA, Accept: "*/*" } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return headSize(res.headers.location).then(resolve);
        }
        const size = Number(res.headers["content-length"]) || 0;
        res.resume();
        resolve(size);
      }
    );
    req.setTimeout(15000, () => req.destroy());
    req.on("error", () => resolve(0));
    req.end();
  });
}

// ------------------------------------------------------------
//  Descarga con progreso, reanudación y reintentos
// ------------------------------------------------------------
function downloadFile(url, dest, onProgress, redirects = 0) {
  try {
    assertAllowedUrl(url, "descarga del modpack");
  } catch (err) {
    return Promise.reject(err);
  }
  return new Promise((resolve, reject) => {
    let start = 0;
    try {
      start = fs.statSync(dest).size;
    } catch {
      /* todavía no existe */
    }

    const headers = { Accept: "*/*" };
    if (start > 0) headers.Range = `bytes=${start}-`;

    const req = https.get(url, { headers: { "User-Agent": UA, ...headers } }, (res) => {
      // --- Redirecciones (GitHub -> storage) ---
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects >= 6) return reject(new Error("Demasiadas redirecciones al descargar."));
        return downloadFile(res.headers.location, dest, onProgress, redirects + 1).then(resolve, reject);
      }

      // --- Rango ya completo (el archivo estaba entero) ---
      if (res.statusCode === 416 && start > 0) {
        res.resume();
        try {
          fs.rmSync(dest, { force: true });
        } catch {
          /* nada */
        }
        return downloadFile(url, dest, onProgress, redirects).then(resolve, reject);
      }

      if (res.statusCode >= 400) {
        res.resume();
        return reject(new Error(`La descarga falló (HTTP ${res.statusCode}).`));
      }

      // Si pedimos reanudar y el servidor lo ignora, empezamos de cero.
      const append = start > 0 && res.statusCode === 206;
      if (start > 0 && !append) {
        try {
          fs.rmSync(dest, { force: true });
        } catch {
          /* nada */
        }
      }

      const total = (append ? start : 0) + (Number(res.headers["content-length"]) || 0);
      let got = append ? start : 0;
      let lastAt = Date.now();
      let lastBytes = got;
      let speed = 0;

      const file = fs.createWriteStream(dest, { flags: append ? "a" : "w" });

      res.on("data", (chunk) => {
        got += chunk.length;
        const now = Date.now();
        if (now - lastAt >= 250) {
          speed = ((got - lastBytes) * 1000) / (now - lastAt);
          lastAt = now;
          lastBytes = got;
          if (onProgress) onProgress(got, total, speed);
        }
      });
      res.on("error", (err) => {
        file.destroy();
        reject(err);
      });
      file.on("error", reject);
      file.on("finish", () =>
        file.close(() => {
          if (onProgress) onProgress(got, total, speed);
          resolve({ bytes: got, total });
        })
      );
      res.pipe(file);
    });

    req.setTimeout(TIMEOUT, () => req.destroy(new Error("La descarga se quedó sin respuesta.")));
    req.on("error", reject);
  });
}

async function downloadWithRetry(url, dest, onProgress, tries = 3) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      return await downloadFile(url, dest, onProgress);
    } catch (err) {
      lastErr = err;
      if (i < tries) await sleep(900 * i); // espera y reanuda donde quedó
    }
  }
  throw lastErr;
}

// ------------------------------------------------------------
//  Versión disponible
// ------------------------------------------------------------
function cleanVersion(v) {
  return String(v || "").trim().replace(/^v/i, "").slice(0, 40);
}

async function fetchLatestVersion(cfg) {
  const { owner, repo, versionUrl, downloadUrl } = cfg || {};
  if (!owner || !repo) return null;

  const fallbackUrl = downloadUrl || `https://github.com/${owner}/${repo}/releases/latest/download/mods.zip`;

  // 1) version.json del repositorio (cache-buster: se detecta al instante)
  if (versionUrl) {
    try {
      const sep = versionUrl.includes("?") ? "&" : "?";
      const data = await getJSON(`${versionUrl}${sep}t=${Date.now()}`);
      if (data && data.version) {
        const url = data.downloadUrl || data.download_url || fallbackUrl;
        const size = Number(data.size) || (url ? await headSize(url) : 0);
        return {
          version: cleanVersion(data.version),
          downloadUrl: url,
          fallbackUrl,
          size,
          notes: String(data.notes || data.changelog || "").trim(),
        };
      }
    } catch (err) {
      console.warn("No pude leer version.json:", err.message);
    }
  }

  // 2) Respaldo: última release publicada
  try {
    const rel = await getJSON(`${API}/repos/${owner}/${repo}/releases/latest`);
    if (rel && rel.tag_name) {
      const assets = Array.isArray(rel.assets) ? rel.assets : [];
      const asset =
        assets.find((a) => /mods.*\.zip$/i.test(a.name)) ||
        assets.find((a) => /\.zip$/i.test(a.name));
      return {
        version: cleanVersion(rel.tag_name),
        downloadUrl: asset ? asset.browser_download_url : fallbackUrl,
        fallbackUrl,
        size: asset ? asset.size : 0,
        notes: String(rel.body || "").trim(),
      };
    }
  } catch (err) {
    console.warn("No pude consultar la última release:", err.message);
  }

  return null; // sin conexión o repo sin versiones
}

// ------------------------------------------------------------
//  Instalación del ZIP sobre la instancia
// ------------------------------------------------------------
const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

const isJar = (name) => name.toLowerCase().endsWith(".jar");

/* ¿Esta carpeta contiene algo que el modpack pueda instalar?
   Vale "mods/", "config/" o .jar sueltos (mods sin carpeta). */
function hasPayload(dir) {
  if (isDir(path.join(dir, "mods")) || isDir(path.join(dir, "config"))) return true;
  try {
    return fs.readdirSync(dir).some((name) => isJar(name) && !isDir(path.join(dir, name)));
  } catch {
    return false;
  }
}

/* El ZIP puede traer "mods/" y "config/" en la raíz (lo normal), sólo
   uno de los dos, los .jar sueltos o una carpeta contenedora. Devuelve
   la carpeta real donde está el contenido útil. */
function findPayloadRoot(dir, depth = 0) {
  if (hasPayload(dir)) return dir;
  if (depth >= 4) return null;

  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "__MACOSX") continue;
    const found = findPayloadRoot(path.join(dir, entry.name), depth + 1);
    if (found) return found;
  }
  return null;
}

/* Copia el CONTENIDO de "from" dentro de "to", sobrescribiendo archivos
   con el mismo nombre pero conservando los que no vengan en el ZIP. */
function copyContents(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    if (name === "__MACOSX") continue;
    fs.cpSync(path.join(from, name), path.join(to, name), { recursive: true, force: true });
  }
}

/* Espacio libre en el disco de la instancia (si el sistema lo permite). */
function checkFreeSpace(dir, needed) {
  if (!needed) return;
  try {
    const st = fs.statfsSync(dir);
    const free = Number(st.bavail) * Number(st.bsize);
    if (free && free < needed * 2.2) {
      throw new Error("No hay espacio suficiente en el disco para descargar el modpack.");
    }
  } catch (err) {
    if (err && err.message && err.message.startsWith("No hay espacio")) throw err;
    /* statfs no disponible: se continúa */
  }
}

/**
 * Descarga el modpack y reemplaza "<instancia>/mods".
 * onProgress(fracción 0..1, texto)
 */
async function installModpack(info, instanceDir, onProgress = () => {}) {
  if (!info || !info.downloadUrl) {
    throw new Error("El repositorio no indica de dónde descargar el modpack.");
  }
  if (!instanceDir) throw new Error("No hay una carpeta de instancia configurada.");

  fs.mkdirSync(instanceDir, { recursive: true });
  checkFreeSpace(instanceDir, info.size || 0);

  const workDir = path.join(instanceDir, WORK_DIR);
  const unpackDir = path.join(workDir, "unpack");
  const zipPath = path.join(workDir, "mods.zip");
  fs.mkdirSync(workDir, { recursive: true });

  try {
    // ---- 1) Descarga (se reutiliza si ya estaba completa) ----
    let alreadyThere = false;
    try {
      alreadyThere = !!info.size && fs.statSync(zipPath).size === info.size;
    } catch {
      alreadyThere = false;
    }

    if (!alreadyThere) {
      onProgress(0, "Conectando con GitHub...");
      const report = (got, total, speed) => {
        const frac = total ? Math.min(1, got / total) : 0;
        const pct = Math.round(frac * 100);
        const vel = speed > 0 ? ` · ${mb(speed)} MB/s` : "";
        onProgress(
          frac * 0.85,
          total
            ? `Descargando mods · ${pct}% (${Math.round(got / 1024 ** 2)} de ${Math.round(total / 1024 ** 2)} MB)${vel}`
            : `Descargando mods · ${mb(got)} MB${vel}`
        );
      };

      try {
        await downloadWithRetry(info.downloadUrl, zipPath, report);
      } catch (err) {
        if (info.fallbackUrl && info.fallbackUrl !== info.downloadUrl) {
          console.warn("Descarga principal fallida, probando el respaldo:", err.message);
          await downloadWithRetry(info.fallbackUrl, zipPath, report);
        } else {
          throw err;
        }
      }

      if (info.size && fs.statSync(zipPath).size !== info.size) {
        throw new Error("La descarga quedó incompleta. Vuelve a intentarlo.");
      }
    }

    // ---- 2) Extracción a una carpeta temporal ----
    onProgress(0.88, "Extrayendo los mods...");
    fs.rmSync(unpackDir, { recursive: true, force: true });
    fs.mkdirSync(unpackDir, { recursive: true });
    await extractZipSafe(zipPath, unpackDir);

    const payload = applyModpackPayload(unpackDir, instanceDir, (frac, text) =>
      onProgress(0.88 + frac * 0.11, text)
    );

    onProgress(0.99, "Limpiando archivos temporales...");
    onProgress(1, "Modpack listo.");
    return { ok: true, version: info.version, size: info.size || 0, ...payload };
  } finally {
    // ---- 5) Limpieza: también si la descarga o la extracción fallan ----
    try {
      await fs.promises.rm(workDir, { recursive: true, force: true });
    } catch { /* se limpia en el próximo arranque */ }
  }
}

/**
 * Aplica el contenido YA EXTRAÍDO del modpack sobre la instancia:
 *   · "mods"  -> se reemplaza la carpeta entera (sólo si el ZIP la trae).
 *   · "config" -> se fusiona con sobrescritura (conserva lo demás).
 * Devuelve { hadMods, hadConfig }.
 */
function applyModpackPayload(unpackDir, instanceDir, onProgress = () => {}) {
  const root = findPayloadRoot(unpackDir);
  if (!root) {
    throw new Error("El ZIP del modpack no contiene ni mods ni config.");
  }

  const modsSource = isDir(path.join(root, "mods")) ? path.join(root, "mods") : null;
  const configSource = isDir(path.join(root, "config")) ? path.join(root, "config") : null;

  let looseJars = [];
  try {
    looseJars = fs
      .readdirSync(root)
      .filter((name) => isJar(name) && !isDir(path.join(root, name)))
      .map((name) => path.join(root, name));
  } catch {
    looseJars = [];
  }

  const hasMods = !!modsSource || looseJars.length > 0;
  const hasConfig = !!configSource;
  if (!hasMods && !hasConfig) {
    throw new Error("El ZIP del modpack no contiene ni mods ni config.");
  }

  // ---- Mods: se reemplaza la carpeta entera (sólo si el ZIP trae mods) ----
  let oldDir = null;
  if (hasMods) {
    onProgress(0.3, "Reemplazando los mods...");

    // Se prepara la carpeta nueva aparte y luego se intercambia. Así un
    // fallo a medias no deja la instancia sin mods.
    const modsDir = path.join(instanceDir, "mods");
    const stagingDir = path.join(instanceDir, ".mods-nuevo");
    oldDir = path.join(instanceDir, ".mods-anterior");
    fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.mkdirSync(stagingDir, { recursive: true });

    if (modsSource) copyContents(modsSource, stagingDir);
    for (const jar of looseJars) {
      fs.cpSync(jar, path.join(stagingDir, path.basename(jar)), { force: true });
    }

    fs.rmSync(oldDir, { recursive: true, force: true });
    if (isDir(modsDir)) fs.renameSync(modsDir, oldDir);
    try {
      fs.renameSync(stagingDir, modsDir);
    } catch (err) {
      // Si algo falla, se deja la carpeta anterior como estaba.
      fs.rmSync(stagingDir, { recursive: true, force: true });
      if (!isDir(modsDir) && isDir(oldDir)) fs.renameSync(oldDir, modsDir);
      throw err;
    }
  }

  // ---- Config: se fusiona (nunca se borra la del jugador) ----
  if (hasConfig) {
    onProgress(0.7, "Actualizando la configuración...");
    copyContents(configSource, path.join(instanceDir, "config"));
  }

  // Otros archivos que traiga el ZIP (resourcepacks, defaultconfigs…)
  // se fusionan igual, sin tocar lo que ya exista de más.
  try {
    for (const name of fs.readdirSync(root)) {
      if (name === "mods" || name === "config" || name === "__MACOSX") continue;
      const from = path.join(root, name);
      if (isJar(name) && !isDir(from)) continue; // ya se copiaron como mods
      fs.cpSync(from, path.join(instanceDir, name), { recursive: true, force: true });
    }
  } catch (err) {
    console.warn("El modpack traía archivos extra que no se pudieron copiar:", err.message);
  }

  if (oldDir) fs.rmSync(oldDir, { recursive: true, force: true });
  onProgress(1, "Contenido del modpack instalado.");
  return { hadMods: hasMods, hadConfig: hasConfig };
}

module.exports = { fetchLatestVersion, installModpack, applyModpackPayload };
