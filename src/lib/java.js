// ============================================================
//  Búsqueda y resolución de Java
//  Minecraft 1.20.1 + Forge 47.x necesitan Java 17. Se prefiere
//  una Java 17 (del sistema o descargada en la instancia) y, si
//  no hay ninguna, minecraft-java-core descarga el runtime de
//  Mojang automáticamente (java-runtime-beta) antes de parchear.
// ============================================================
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync, execFile } = require("child_process");
const { assertAllowedUrl, fetchAllowed } = require("./net");
const { extractZipSafe } = require("./zip");

const JAVA_17 = 17;
const MIN_JAVA = 17;

// Rutas directas habituales (las carpetas se escanean más abajo).
const CANDIDATES = [
  process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, "bin", "java.exe"),
  "C:/Program Files/Java/jdk-17/bin/java.exe",
  "C:/Program Files/Eclipse Adoptium/jdk-17/bin/java.exe",
  "C:/Program Files/Microsoft/jdk-17.0.0.0/bin/java.exe",
].filter(Boolean);

// Carpetas donde suelen instalarse JDK/JRE.
const SCAN_ROOTS = [
  "C:/Program Files/Java",
  "C:/Program Files/Eclipse Adoptium",
  "C:/Program Files/Microsoft",
  "C:/Program Files/Zulu",
  "C:/Program Files/Amazon Corretto",
  "C:/Program Files/BellSoft",
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs", "Eclipse Adoptium"),
  process.env.USERPROFILE && path.join(process.env.USERPROFILE, ".jdks"),
].filter(Boolean);

const versionCache = new Map();

/* Devuelve la versión mayor de Java (17, 21…) o null si no se puede leer. */
function versionOf(javaPath) {
  if (!javaPath) return null;
  const key = javaPath.toLowerCase();
  if (versionCache.has(key)) return versionCache.get(key);
  try {
    // stderr a "ignore": "java -version" escribe ahí, y si el launcher se
    // abrió sin una consola válida, Node intentaría escribir en un tubo
    // cerrado y lanzaría un EPIPE que tumba el proceso.
    const r = spawnSync(javaPath, ["-version"], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
      windowsHide: true,
    });
    const out = ((r.stdout || Buffer.alloc(0)).toString() + (r.stderr || Buffer.alloc(0)).toString());
    const m = out.match(/version "?(\d+)(?:\.(\d+))?/);
    const major = m ? (parseInt(m[1], 10) === 1 ? parseInt(m[2], 10) : parseInt(m[1], 10)) : null;
    versionCache.set(key, major);
    return major;
  } catch {
    versionCache.set(key, null);
    return null;
  }
}

/* Versión async (no bloquea el hilo). */
async function versionOfAsync(javaPath) {
  if (!javaPath) return null;
  const key = javaPath.toLowerCase();
  if (versionCache.has(key)) return versionCache.get(key);
  return new Promise((resolve) => {
    execFile(javaPath, ["-version"], { timeout: 5000, windowsHide: true }, (err, stdout, stderr) => {
      const out = String(stdout || "") + String(stderr || "");
      const m = out.match(/version "?(\d+)(?:\.(\d+))?/);
      const major = m ? (parseInt(m[1], 10) === 1 ? parseInt(m[2], 10) : parseInt(m[1], 10)) : null;
      versionCache.set(key, major);
      resolve(major);
    });
  });
}

async function systemJavasAsync() {
  const found = [];
  const seen = new Set();
  const add = (p) => {
    if (!p) return;
    let full;
    try { full = path.resolve(p); } catch { return; }
    const key = full.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    if (fs.existsSync(full)) found.push(full);
  };

  for (const p of CANDIDATES) add(p);

  for (const root of SCAN_ROOTS) {
    try {
      if (!fs.existsSync(root)) continue;
      const entries = await fs.promises.readdir(root);
      for (const entry of entries) add(path.join(root, entry, "bin", "java.exe"));
    } catch { /* ignore */ }
  }

  try {
    const { stdout } = await new Promise((resolve, reject) => {
      execFile("where", ["java"], { timeout: 5000, windowsHide: true }, (err, stdout) => (err ? reject(err) : resolve({ stdout })));
    });
    for (const line of String(stdout).split(/\r?\n/)) {
      const p = line.trim();
      if (p) add(p);
    }
  } catch { /* no está en PATH */ }

  return found;
}

async function findJavaAsync() {
  let best = null;
  for (const p of await systemJavasAsync()) {
    const version = await versionOfAsync(p);
    if (!version || version < MIN_JAVA) continue;
    if (version === JAVA_17) return { path: p, version, compatible: true };
    if (!best || version < best.version) best = { path: p, version, compatible: false };
  }
  return best;
}

async function findJava17Async() {
  for (const p of await systemJavasAsync()) {
    if ((await versionOfAsync(p)) === JAVA_17) return { path: p, version: JAVA_17, compatible: true };
  }
  return null;
}

/* ¿La carpeta es un directorio? (sin lanzar excepciones) */
function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/* Java 17 descargada dentro de la propia instancia:
   <instancia>/runtime/java-runtime-beta/bin/javaw.exe
   <instancia>/runtime/java17-runtime/bin/javaw.exe
   <instancia>/runtime/jre-17/<zulu>/bin/javaw.exe            */
function runtimeJava(dir) {
  if (!dir) return null;
  const root = path.join(dir, "runtime");
  if (!isDir(root)) return null;

  const dirs = [];
  try {
    for (const entry of fs.readdirSync(root)) {
      const p = path.join(root, entry);
      if (!isDir(p)) continue;
      dirs.push(p);
      // El fallback de Azul extrae dentro de runtime/jre-17/<carpeta>/
      try {
        for (const sub of fs.readdirSync(p)) {
          const sp = path.join(p, sub);
          if (isDir(sp)) dirs.push(sp);
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    return null;
  }

  // Prioriza los runtimes que sabemos que son Java 17.
  const rank = (p) => {
    const n = path.basename(p).toLowerCase();
    const parent = path.basename(path.dirname(p)).toLowerCase();
    if (n.includes("beta") || parent.includes("beta")) return 0;
    if (n.includes("17") || parent.includes("17")) return 1;
    if (n.includes("runtime")) return 2;
    return 3;
  };
  dirs.sort((a, b) => rank(a) - rank(b));

  for (const d of dirs) {
    const javaExe = path.join(d, "bin", "java.exe");
    const javawExe = path.join(d, "bin", "javaw.exe");
    const probe = fs.existsSync(javaExe) ? javaExe : fs.existsSync(javawExe) ? javawExe : null;
    if (!probe) continue;
    const version = versionOf(probe);
    if (version === JAVA_17) {
      // javaw evita que se abra una consola al lanzar el juego.
      return {
        path: fs.existsSync(javawExe) ? javawExe : javaExe,
        version,
        compatible: true,
        source: "instance",
      };
    }
  }
  return null;
}

const RUNTIME_ROOT = path.join(os.homedir(), "AppData", "Roaming", "Proyectados MC", "runtime", "temurin-17");

function sha256File(filePath) {
  const crypto = require("crypto");
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function findJavaHome(root) {
  if (!root || !isDir(root)) return null;
  if (fs.existsSync(path.join(root, "bin", "java.exe"))) return root;
  try {
    for (const entry of fs.readdirSync(root)) {
      const p = path.join(root, entry);
      if (isDir(p) && fs.existsSync(path.join(p, "bin", "java.exe"))) return p;
    }
  } catch { /* ignore */ }
  // búsqueda recursiva superficial
  try {
    for (const entry of fs.readdirSync(root)) {
      const p = path.join(root, entry);
      if (!isDir(p)) continue;
      const found = findJavaHome(p);
      if (found) return found;
    }
  } catch { /* ignore */ }
  return null;
}

async function fetchTemurinInfo(imageType = "jre") {
  const url = `https://api.adoptium.net/v3/assets/latest/17/ga?architecture=x64&image_type=${imageType}&os=windows&vendor=eclipse`;
  const res = await fetchAllowed(url);
  if (!res.ok) throw new Error(`Adoptium HTTP ${res.status}`);
  const data = await res.json();
  const bin = data && data[0] && data[0].binaries && data[0].binaries[0];
  if (!bin || !bin.package || !bin.package.link) throw new Error("No se encontró un paquete Temurin 17.");
  assertAllowedUrl(bin.package.link, "Temurin 17");
  return { url: bin.package.link, checksum: bin.package.checksum, version: (data[0].version && data[0].version.semver) || "17", imageType };
}

const DOWNLOAD_TIMEOUT = 30000;

async function downloadFile(url, dest, onProgress) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + ".tmp";
  let lastErr;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    let timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);
    let stream = null;
    let size = 0;
    try {
      const res = await fetchAllowed(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Descarga HTTP ${res.status}`);
      stream = fs.createWriteStream(tmp);
      let writeError = null;
      stream.on("error", (err) => { writeError = err; });
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        clearTimeout(timer);
        timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);
        if (writeError) throw writeError;
        size += value.length;
        if (!stream.write(Buffer.from(value))) {
          await new Promise((resolve, reject) => {
            stream.once("drain", resolve);
            stream.once("error", reject);
          });
        }
      }
      if (writeError) throw writeError;
      await new Promise((resolve, reject) => {
        stream.once("finish", resolve);
        stream.once("error", reject);
        stream.end();
      });
      if (writeError) throw writeError;
      stream = null;
      clearTimeout(timer);
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      fs.renameSync(tmp, dest);
      if (onProgress) onProgress(`Descargado ${Math.round(size / 1024 / 1024)} MB`);
      return size;
    } catch (err) {
      clearTimeout(timer);
      if (stream) {
        try { stream.destroy(); } catch { /* ignore */ }
      }
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* ignore */ }
      lastErr = err;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastErr;
}

async function ensureTemurinJava(onProgress) {
  // 1) Ya instalado y válido
  const marker = path.join(RUNTIME_ROOT, "installed.json");
  if (fs.existsSync(marker)) {
    try {
      const info = JSON.parse(fs.readFileSync(marker, "utf8"));
      if (info && info.home && isDir(info.home)) {
        const javaExe = fs.existsSync(path.join(info.home, "bin", "javaw.exe"))
          ? path.join(info.home, "bin", "javaw.exe")
          : path.join(info.home, "bin", "java.exe");
        if (fs.existsSync(javaExe) && versionOf(javaExe) === 17) {
          return { path: javaExe, version: 17, compatible: true, source: "portable" };
        }
      }
    } catch { /* reinstalar */ }
  }

  // 2) Buscar en runtime existente
  if (isDir(RUNTIME_ROOT)) {
    const home = findJavaHome(RUNTIME_ROOT);
    if (home) {
      const javaExe = fs.existsSync(path.join(home, "bin", "javaw.exe"))
        ? path.join(home, "bin", "javaw.exe")
        : path.join(home, "bin", "java.exe");
      if (fs.existsSync(javaExe) && versionOf(javaExe) === 17) {
        try {
          fs.writeFileSync(marker, JSON.stringify({ home }, null, 2), "utf8");
        } catch { /* ignore */ }
        return { path: javaExe, version: 17, compatible: true, source: "portable" };
      }
    }
  }

  // 3) Descargar Temurin 17 (JRE si está disponible; si no, JDK)
  fs.mkdirSync(RUNTIME_ROOT, { recursive: true });
  let info;
  try {
    info = await fetchTemurinInfo("jre");
  } catch {
    info = await fetchTemurinInfo("jdk");
  }
  const zipPath = path.join(RUNTIME_ROOT, "temurin-17.zip");
  if (onProgress) onProgress("Descargando Java 17 (Temurin)...");
  await downloadFile(info.url, zipPath, onProgress);

  if (info.checksum) {
    const hash = sha256File(zipPath);
    if (hash.toLowerCase() !== String(info.checksum).toLowerCase()) {
      try { fs.unlinkSync(zipPath); } catch { /* ignore */ }
      throw new Error("El hash de Java 17 no coincide. Descarga cancelada por seguridad.");
    }
  }

  if (onProgress) onProgress("Extrayendo Java 17...");
  const extractDir = path.join(RUNTIME_ROOT, "extract");
  try {
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.mkdirSync(extractDir, { recursive: true });
    await extractZipSafe(zipPath, extractDir);

    const home = findJavaHome(extractDir);
    if (!home) {
      throw new Error("No se pudo localizar java.exe tras extraer Temurin 17.");
    }

    // Mover a una carpeta estable
    const finalHome = path.join(RUNTIME_ROOT, "jdk-17");
    fs.rmSync(finalHome, { recursive: true, force: true });
    fs.renameSync(home, finalHome);

    const javaExe = fs.existsSync(path.join(finalHome, "bin", "javaw.exe"))
      ? path.join(finalHome, "bin", "javaw.exe")
      : path.join(finalHome, "bin", "java.exe");

    if (!fs.existsSync(javaExe) || versionOf(javaExe) !== 17) {
      throw new Error("Java 17 portable no es válido tras la instalación.");
    }

    fs.writeFileSync(marker, JSON.stringify({ home: finalHome, version: info.version, checksum: info.checksum }, null, 2), "utf8");
    if (onProgress) onProgress("Java 17 (Temurin) listo.");
    return { path: javaExe, version: 17, compatible: true, source: "portable" };
  } finally {
    try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath); } catch { /* ignore */ }
    try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/* Java 17 que debe usar el launcher:
   1) Java 17 portable (Temurin) administrado por el launcher (se descarga si falta),
   2) la descargada en la instancia,
   3) una Java 17 del sistema,
   4) null -> minecraft-java-core descargará el runtime de Mojang. */
async function resolveJava(dir, onProgress) {
  try {
    const portable = await ensureTemurinJava(onProgress);
    if (portable) return portable;
  } catch (err) {
    console.warn("[Java] No se pudo obtener Temurin portable:", err && err.message ? err.message : err);
  }
  const inInstance = runtimeJava(dir);
  if (inInstance) return inInstance;
  const system = await findJava17Async();
  return system ? { ...system, source: "system" } : null;
}

module.exports = { findJavaAsync, findJava17Async, versionOf, versionOfAsync, systemJavasAsync, resolveJava, runtimeJava, ensureTemurinJava };
