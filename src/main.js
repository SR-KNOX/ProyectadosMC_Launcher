// ============================================================
//  PROCESO PRINCIPAL DEL LAUNCHER
// ============================================================
const { app, BrowserWindow, ipcMain, dialog, shell, protocol } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

// ------------------------------------------------------------
//  Protocolo propio "app://" para servir la interfaz.
//  La UI usa módulos ES (import/export), que el navegador bloquea
//  sobre file://; con un esquema registrado como "standard" todo
//  funciona como en una web normal.
// ------------------------------------------------------------
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);

const UI_DIR = path.join(__dirname, "ui");
const APP_ORIGIN = "app://launcher";

function isAppUrl(u) {
  try {
    const parsed = new URL(u);
    return parsed.protocol === "app:" && parsed.host === "launcher";
  } catch {
    return false;
  }
}

function openExternalUrl(u) {
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  } catch {
    return false;
  }
  shell.openExternal(u);
  return true;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
};

function serveUI() {
  protocol.handle("app", async (request) => {
    try {
      const url = new URL(request.url);
      let rel = decodeURIComponent(url.pathname);
      if (!rel || rel === "/") rel = "/index.html";
      const file = path.join(UI_DIR, path.normalize(rel).replace(/^[/\\]+/, ""));
      const relCheck = path.relative(UI_DIR, file);
      if (relCheck.startsWith("..") || path.isAbsolute(relCheck)) return new Response("Prohibido", { status: 403 });
      const allowedExt = [".html", ".js", ".mjs", ".css", ".json", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".ttf", ".otf", ".woff", ".woff2", ".mp4", ".webm", ".mp3", ".ogg", ".wav"];
      if (!allowedExt.includes(path.extname(file).toLowerCase())) return new Response("Prohibido", { status: 403 });
      const data = await fs.promises.readFile(file);
      const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
      return new Response(data, { headers: { "Content-Type": type } });
    } catch {
      return new Response("No encontrado", { status: 404 });
    }
  });
}

// Menos procesos de render en segundo plano (el fondo en video se congela).
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");

// El ambiente de fondo puede sonar nada más abrir, sin esperar a un clic.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

// Identidad de la app en Windows: hace que la barra de tareas use el icono
// del launcher y no el de Electron, y que la ventana se agrupe bien.
app.setAppUserModelId("com.proyectadosmc.launcher");

const CFG = require("./config");
const { findJavaAsync, resolveJava } = require("./lib/java");
const {
  prepareInstance,
  launchInstance,
  applyGameVolume,
  isInstanceReady,
  writeInstanceMarker,
} = require("./lib/mc");
const { fetchLatestVersion, installModpack } = require("./lib/modpack");
const { fetchManifest, computeDiff, applyManifest, normalizeManifest } = require("./lib/manifest");

/* La versión del repo es la fuente de verdad: si no coincide con la
   instalada (aunque el número sea "menor"), hay actualización. */
function normalizeVersion(v) {
  return String(v || "").trim().replace(/^v/i, "").toLowerCase();
}

/* ¿La carpeta configurada sigue siendo una instancia válida? */
function profileInstanceReady(profile) {
  return !!(profile && profile.folder && isInstanceReady(profile.folder, CFG.MINECRAFT_VERSION));
}

/* Deja el perfil sincronizado con lo que hay realmente en el disco. */
function syncInstalledFlag(profile) {
  if (!profile) return profile;
  const installed = profileInstanceReady(profile);
  if (profile.installed !== installed) {
    profile.installed = installed;
    writeProfile(profile);
  }
  return profile;
}

// Claves que la interfaz puede escribir en el perfil.
// El resto (installed, forgeVersion, lastModpackVersion) los lleva el proceso principal.
const WRITABLE_KEYS = ["nick", "folder", "ram", "skin", "skinModel", "cape", "volume", "volumeManual", "afterLaunch", "played", "ramManual", "perfLevel", "javaPath"];

let win = null;

// ------------------------------------------------------------
//  Perfil del jugador
// ------------------------------------------------------------
function profilePath() {
  return path.join(app.getPath("userData"), "profile.json");
}

function readProfile() {
  const file = profilePath();
  const tryRead = (p) => {
    try {
      const data = JSON.parse(fs.readFileSync(p, "utf8"));
      return migrateProfile(data);
    } catch {
      return null;
    }
  };
  let result = tryRead(file);
  if (result) return result;
  // Intentar .bak
  const bak = file + ".bak";
  result = tryRead(bak);
  if (result) {
    try { fs.copyFileSync(bak, file); } catch { /* ignore */ }
    return result;
  }
  // Corrupto: renombrar y arrancar por defecto
  try {
    if (fs.existsSync(file)) {
      const corrupt = file + ".corrupt-" + Date.now();
      fs.renameSync(file, corrupt);
    }
  } catch { /* ignore */ }
  return null;
}

/* Perfiles antiguos (instanceDir / ramGB) → nombres actuales (folder / ram). */
function migrateProfile(p) {
  if (!p || typeof p !== "object") return p;
  if (!p.folder && p.instanceDir) p.folder = p.instanceDir;
  if (p.ram === undefined && p.ramGB !== undefined) p.ram = String(p.ramGB);
  delete p.instanceDir;   // ya no se usan
  delete p.ramGB;
  return p;
}

function atomicWriteFileSync(file, data) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = file + ".tmp";
  const bak = file + ".bak";
  // Reintentos para EPERM/EBUSY
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (fs.existsSync(file)) {
        try { fs.copyFileSync(file, bak); } catch { /* ignore */ }
      }
      fs.writeFileSync(tmp, data, "utf8");
      if (fs.existsSync(file)) {
        try { fs.unlinkSync(file); } catch { /* ignore */ }
      }
      fs.renameSync(tmp, file);
      return true;
    } catch (err) {
      if (attempt < 2 && (err.code === "EPERM" || err.code === "EBUSY")) {
        // espera corta
        const start = Date.now();
        while (Date.now() - start < 100 * (attempt + 1)) { /* busy wait */ }
        continue;
      }
      // último recurso: escribir directo
      try { fs.writeFileSync(file, data, "utf8"); return true; } catch { return false; }
    }
  }
  return false;
}

function writeProfile(p) {
  atomicWriteFileSync(profilePath(), JSON.stringify(p, null, 2));
}

function sanitizeProfilePatch(patch) {
  const out = {};
  if (!patch || typeof patch !== "object") return out;
  if (typeof patch.nick === "string") {
    const nick = patch.nick.trim();
    if (/^\w{3,16}$/.test(nick)) out.nick = nick;
  }
  if (typeof patch.folder === "string" && path.isAbsolute(patch.folder)) {
    out.folder = path.normalize(patch.folder);
  }
  if (patch.ram !== undefined) {
    const ram = Number.parseFloat(patch.ram);
    if (Number.isFinite(ram)) {
      const total = os.totalmem() / 1024 ** 3;
      out.ram = String(Math.max(2, Math.min(total, ram)));
    }
  }
  if (typeof patch.skin === "string" && patch.skin.length <= 4 * 1024 * 1024) out.skin = patch.skin;
  if (patch.skinModel === "classic" || patch.skinModel === "slim") out.skinModel = patch.skinModel;
  if (typeof patch.cape === "string" && patch.cape.length <= 4 * 1024 * 1024) out.cape = patch.cape;
  if (patch.volume !== undefined) {
    const volume = Number.parseFloat(patch.volume);
    if (Number.isFinite(volume)) {
      out.volume = Math.max(0, Math.min(100, volume));
      out.volumeManual = true;
    }
  }
  if (typeof patch.volumeManual === "boolean") out.volumeManual = patch.volumeManual;
  if (patch.afterLaunch === "close" || patch.afterLaunch === "minimize" || patch.afterLaunch === "nothing") {
    out.afterLaunch = patch.afterLaunch;
  }
  if (typeof patch.played === "boolean") out.played = patch.played;
  if (typeof patch.ramManual === "boolean") out.ramManual = patch.ramManual;
  if (typeof patch.perfLevel === "string" && ["auto", "low", "medium", "high"].includes(patch.perfLevel)) out.perfLevel = patch.perfLevel;
  if (typeof patch.javaPath === "string" && path.isAbsolute(patch.javaPath) && patch.javaPath.length <= 512) out.javaPath = patch.javaPath;
  return out;
}

function mergeProfile(patch) {
  const p = readProfile() || {};
  const clean = sanitizeProfilePatch(patch);
  for (const k of WRITABLE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(clean, k)) p[k] = clean[k];
  }
  writeProfile(p);
  return p;
}

// ------------------------------------------------------------
//  CustomSkinLoader lee directamente del sistema de archivos de la instancia:
//    <instancia>/CustomSkinLoader/LocalSkin/skins/<nick>.png
//    <instancia>/CustomSkinLoader/LocalSkin/capes/<nick>.png
//  Sin este paso el jugador ve una skin en el launcher pero el juego usa la
//  clásica MCreator/steve genérica. Se hace ANTES de lanzar.
// ------------------------------------------------------------
function writeSkinToInstance(profile) {
  try {
    const dir = profile && profile.folder;
    const nick = String((profile && profile.nick) || "").trim();
    if (!dir || !nick || !fs.existsSync(dir)) return "skin-skip";
    const decode = (dataUrl) => {
      const s = String(dataUrl || "");
      if (!/^data:image\/png;base64,/.test(s)) return null;
      const buf = Buffer.from(s.slice("data:image/png;base64,".length), "base64");
      return buf.length > 0 && buf.length <= 4 * 1024 * 1024 ? buf : null;
    };
    const skin = decode(profile.skin);
    const cape = decode(profile.cape);
    if (skin) {
      const dirSkin = path.join(dir, "CustomSkinLoader", "LocalSkin", "skins");
      fs.mkdirSync(dirSkin, { recursive: true });
      fs.writeFileSync(path.join(dirSkin, nick + ".png"), skin);
    }
    if (cape) {
      const dirCape = path.join(dir, "CustomSkinLoader", "LocalSkin", "capes");
      fs.mkdirSync(dirCape, { recursive: true });
      fs.writeFileSync(path.join(dirCape, nick + ".png"), cape);
    }
    return "skin-ok";
  } catch (err) {
    console.warn("No se pudo copiar skin/capa a la instancia:", err && err.message ? err.message : err);
    return "skin-failed";
  }
}

function send(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

// ------------------------------------------------------------
//  Estado de la sesión de juego
//  Evita lanzar dos veces (doble clic, instalación + Jugar…) y
//  permite que un error libere la interfaz para reintentar.
// ------------------------------------------------------------
let gameBusy = false;
let gameRunning = false;

function friendlyGameError(message) {
  const text = String(message || "Error desconocido");

  // Errores de red (los más habituales al descargar Minecraft o Forge).
  if (/fetch failed|failed to fetch|network request failed/i.test(text)) {
    return "No se pudo conectar con los servidores de Minecraft. Revisa tu conexión a internet y vuelve a intentarlo.";
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket hang up|timed?\s*out|timeout/i.test(text)) {
    return "La conexión con los servidores se interrumpió. Revisa tu internet y vuelve a intentarlo.";
  }
  if (/ENOSPC|no space left/i.test(text)) {
    return "No hay espacio suficiente en el disco. Libera espacio e inténtalo de nuevo.";
  }
  if (/EPERM|EBUSY|access is denied|being used by another process/i.test(text)) {
    return "Un archivo está en uso (puede ser Minecraft o el antivirus). Ciérralo e inténtalo de nuevo.";
  }
  if (/patcher\s+Forge/i.test(text)) {
    const m = /code\s+(\d+)/i.exec(text);
    return (
      `No se pudo preparar Forge${m ? ` (código ${m[1]})` : ""}. ` +
      "Pulsa Jugar para reintentar; el detalle está en logs/forge-patch.log."
    );
  }
  if (/ENOENT|not found|no se encuentra/i.test(text) && /java/i.test(text)) {
    return "No encontré una Java válida para iniciar el juego. Se intentará descargar Java 17 automáticamente.";
  }
  if (/is not found|not found/i.test(text) && /minecraft/i.test(text)) {
    return "No se encontró la versión de Minecraft en los servidores de Mojang. Inténtalo más tarde.";
  }
  if (/authenticator not found/i.test(text)) {
    return "No se pudo crear la cuenta offline. Comprueba tu nick y vuelve a intentarlo.";
  }
  if (/main class not found/i.test(text)) {
    return "No se pudo preparar el inicio del juego. Vuelve a intentarlo.";
  }

  // Si ya viene en español, se muestra tal cual.
  return text;
}

/* ¿Merece la pena reintentar? Sólo fallos de conexión puntuales. */
function isRetryableNetworkError(message) {
  const text = String(message || "");
  return /fetch failed|failed to fetch|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket hang up|timed?\s*out|timeout/i.test(
    text
  );
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Descarga Minecraft + Forge sin abrir el juego.
   Reintenta hasta 3 veces si el fallo es de conexión. */
async function prepareWithRetry(options, onRetry = () => {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await prepareInstance(options);
    } catch (err) {
      lastError = err;
      const detail = String(err && err.message ? err.message : err);
      console.warn(`[Launcher] Preparación falló (intento ${attempt}/3): ${detail}`);
      if (attempt === 3 || !isRetryableNetworkError(detail)) break;
      onRetry(`Conexión interrumpida. Reintentando (${attempt + 1}/3)...`);
      await wait(1500 * attempt);
    }
  }
  throw lastError;
}

/* Descarga los mods desde GitHub con reintentos. Si no se pueden bajar,
   la instalación falla (no se muestra \"Versión instalada\" a medias). */
async function downloadModpackWithRetry(dir, onProgress) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const info = await fetchLatestVersion(CFG.GITHUB);
      if (!info || !info.downloadUrl) {
        throw new Error("No se pudo conectar con GitHub para descargar el modpack.");
      }
      await installModpack(info, dir, onProgress);
      return info;
    } catch (err) {
      lastError = err;
      const detail = String(err && err.message ? err.message : err);
      const retryable =
        isRetryableNetworkError(detail) ||
        /GitHub|descarga|HTTP \d|conexi[oó]n|tiempo de espera/i.test(detail);
      console.warn(`[Launcher] Modpack falló (intento ${attempt}/3): ${detail}`);
      if (attempt === 3 || !retryable) break;
      onProgress(0, `No se pudieron descargar los mods. Reintentando (${attempt + 1}/3)...`);
      await wait(1500 * attempt);
    }
  }

  const detail = String(lastError && lastError.message ? lastError.message : lastError || "");
  throw new Error(
    detail
      ? friendlyGameError(detail)
      : "No se pudieron descargar los mods del modpack. Revisa tu conexión a internet."
  );
}

function reportGameError(channel, message, info) {
  const detail = String(message || "Error desconocido");
  const friendly = friendlyGameError(detail);
  console.error("[Launcher] " + detail);
  if (info && info.tail) console.error("[Launcher] Últimas líneas del parche:\n" + info.tail);
  send(channel, {
    message: friendly,
    detail,
    tail: (info && info.tail) || "",
    log: (info && info.logFile) || "",
  });
}

// Red de seguridad: ningún error inesperado debe mostrar el diálogo
// "A JavaScript error occurred in the main process".
process.on("uncaughtException", (err) => {
  console.error("[Launcher] Excepción no controlada:", err);
  gameBusy = false;
  send("launch:error", {
    message: "El launcher tuvo un problema inesperado. Puedes volver a intentarlo.",
    detail: String(err && err.message ? err.message : err),
    tail: err && err.stack ? String(err.stack) : "",
    log: "",
  });
});

process.on("unhandledRejection", (reason) => {
  console.error("[Launcher] Promesa rechazada sin capturar:", reason);
});


// ------------------------------------------------------------
//  Ventana
// ------------------------------------------------------------

/* Icono del launcher (emblema de Proyectados).
   Empaquetado: resources/icon.ico (copiado por extraResources).
   En desarrollo: build/icon.ico del propio proyecto. */
function appIcon() {
  const candidates = [];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, "icon.ico"));
  candidates.push(path.join(__dirname, "..", "build", "icon.ico"));
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch { /* ruta no accesible */ }
  }
  return undefined;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 940,
    minHeight: 600,
    resizable: true,
    frame: false,
    backgroundColor: "#040a14",
    show: false,
    title: "Proyectados MC",
    icon: appIcon(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
      webviewTag: false,
    },
  });

  // Seguridad de navegación
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!isAppUrl(url)) e.preventDefault();
  });
  win.webContents.on("will-redirect", (e, url) => {
    if (!isAppUrl(url)) e.preventDefault();
  });
  win.webContents.on("will-attach-webview", (e) => e.preventDefault());

  win.loadURL(`${APP_ORIGIN}/index.html`);
  win.once("ready-to-show", () => win.show());
}

// Cierra el launcher para liberar todos sus recursos.
// El juego va en modo "detached", así que sigue abierto.
function quitLauncher() {
  if (win && !win.isDestroyed()) win.destroy();
  app.exit(0);
}

// ------------------------------------------------------------
//  Qué hacer después de abrir Minecraft (opción del usuario)
//  close    -> cerrar el launcher
//  minimize -> minimizar el launcher
//  nothing  -> dejarlo visible
// ------------------------------------------------------------
function applyAfterLaunch() {
  const profile = readProfile() || {};
  const action = profile.afterLaunch || "close";
  if (action === "close") {
    // No se cierra el proceso: se oculta la ventana para conservar
    // la lectura de salida, la detección de OOM y los logs.
    setTimeout(() => {
      if (win && !win.isDestroyed()) win.hide();
    }, 1500);
  } else if (action === "minimize") {
    setTimeout(() => {
      if (win && !win.isDestroyed()) win.minimize();
    }, 1500);
  }
  // "nothing": no se hace nada, el launcher se queda a la vista.
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
    } else {
      createWindow();
    }
  });

  app.whenReady().then(() => {
    // Limpieza de .tmp residuales de instalaciones/actualizaciones interrumpidas
    try {
      const profile = readProfile();
      if (profile && profile.folder) {
        for (const sub of ["mods", "config"]) {
          const dir = path.join(profile.folder, sub);
          if (fs.existsSync(dir)) {
            for (const f of fs.readdirSync(dir)) {
              if (f.endsWith(".tmp")) {
                try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ }
              }
            }
          }
        }
      }
    } catch { /* ignore */ }
    serveUI();
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  // Si el juego sigue en ejecución, se mantiene el proceso principal.
  if (gameRunning) return;
  app.exit(0);
});

// ------------------------------------------------------------
//  IPC — controles de ventana
// ------------------------------------------------------------
ipcMain.on("window:minimize", () => win && win.minimize());
ipcMain.on("window:maximize", () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize(); else win.maximize();
});
ipcMain.on("window:close", () => quitLauncher());

// ------------------------------------------------------------
//  IPC — perfil
// ------------------------------------------------------------
ipcMain.handle("profile:get", () => {
  const profile = syncInstalledFlag(readProfile());
  if (!profile) return profile;
  return {
    ...profile,
    installed: !!profile.installed,
    instanceMissing: !!profile.folder && !profileInstanceReady(profile),
  };
});

ipcMain.handle("profile:save", (_e, patch) => {
  mergeProfile(patch);
  return true;
});

ipcMain.handle("profile:pick-folder", async () => {
  const res = await dialog.showOpenDialog(win, {
    title: "Elige dónde instalar el modpack",
    properties: ["openDirectory", "createDirectory"],
    buttonLabel: "Seleccionar carpeta",
  });
  if (res.canceled || !res.filePaths[0]) return null;
  return res.filePaths[0];
});

ipcMain.handle("instance:status", async () => {
  const profile = syncInstalledFlag(readProfile() || {});
  const folder = profile && profile.folder ? String(profile.folder) : "";
  const folderExists = !!(folder && fs.existsSync(folder));
  const ready = folderExists && profileInstanceReady(profile);
  const localVersion = normalizeVersion(profile.lastModpackVersion);
  let repairAvailable = false;
  let updateAvailable = false;
  let remoteVersion = "";
  let diffSummary = null;
  let offline = false;

  if (ready && CFG.GITHUB && CFG.GITHUB.enabled) {
    try {
      const manifest = await fetchManifest(CFG.GITHUB);
      remoteVersion = normalizeVersion(manifest.version);
      const diff = computeDiff(manifest, folder);
      diffSummary = diff && diff.summary ? diff.summary : null;
      const hasDiff = !!(diff && diff.mods && diff.configs && (
        diff.mods.add.length || diff.mods.update.length ||
        diff.configs.add.length || (diff.configs.forced || []).length
      ));
      repairAvailable = hasDiff;
      updateAvailable = !localVersion || (remoteVersion && remoteVersion !== localVersion) || hasDiff;
    } catch {
      offline = true;
    }
  } else if (!ready && folder) {
    // Instancia configurada pero incompleta/faltante: requiere reinstalar o reparar completo
    repairAvailable = true;
  }

  return {
    folder,
    folderExists,
    ready,
    installed: !!(profile && profile.installed),
    needsInstall: !ready,
    repairAvailable,
    updateAvailable,
    localVersion,
    remoteVersion,
    diffSummary,
    offline,
  };
});

// ------------------------------------------------------------
//  IPC — datos del equipo (RAM total, para el deslizador)
// ------------------------------------------------------------
function freeSpaceBytes(dir) {
  try {
    const st = fs.statfsSync(dir);
    return Number(st.bavail) * Number(st.bsize);
  } catch {
    return null;
  }
}

async function detectGpus() {
  try {
    const { execFile } = require("child_process");
    const out = await new Promise((resolve, reject) => {
      execFile(
        "powershell.exe",
        ["-NoProfile", "-Command", "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress"],
        { windowsHide: true, timeout: 10000 },
        (err, stdout) => (err ? reject(err) : resolve(stdout))
      );
    });
    const text = String(out || "");
    if (!text.trim()) return [];
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr
      .filter((g) => g && g.Name)
      .map((g) => {
        const name = String(g.Name);
        const vramGB = Math.round(((Number(g.AdapterRAM) || 0) / 1024 ** 3) * 10) / 10;
        const integrated = /intel|radeon\(tm\) graphics|vega|radeon graphics/i.test(name);
        return { name, vramGB, dedicated: !integrated };
      });
  } catch {
    return [];
  }
}

ipcMain.handle("system:info", async () => ({
  totalRamGB: Math.round((os.totalmem() / 1024 ** 3) * 2) / 2,
  freeRamGB: Math.round((os.freemem() / 1024 ** 3) * 10) / 10,
  cpus: os.cpus().length,
  cpuThreads: os.cpus().length,
  cpuModel: (os.cpus()[0] && os.cpus()[0].model) || "",
  gpus: await detectGpus(),
  platform: process.platform,
  home: os.homedir(),
}));

ipcMain.handle("java:detect", async () => findJavaAsync());

// Optimizacion del entorno de Windows (solo con permiso explicito)
ipcMain.handle("env:optimize", async () => {
  const profile = readProfile();
  const dir = profile && profile.folder;
  if (!dir) return { ok: false, error: "No hay carpeta de instancia." };
  const choice = await dialog.showMessageBox(win, {
    type: "question",
    buttons: ["Si, optimizar", "No"],
    defaultId: 0,
    cancelId: 1,
    title: "Optimizacion del entorno",
    message: "Permitir que el launcher optimice Windows para Minecraft?",
    detail:
      "Se intentara: excluir la carpeta del juego de Windows Defender, preferir GPU de alto rendimiento para el javaw.exe que de verdad usa el juego, y activar el plan de energia de rendimiento alto. Algunas acciones requieren permisos de administrador y pueden fallar sin ellos.",
  });
  if (choice.response !== 0) return { ok: false, cancelled: true };

  const { execFile } = require("child_process");
  const { promisify } = require("util");
  const execFileAsync = promisify(execFile);
  const results = { defender: false, gpu: false, power: false };
  const notes = [];

  // Defender: exclusion de la carpeta de la instancia (requiere privilegios elevados en muchos equipos)
  if (process.platform === "win32") {
    try {
      await execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy", "Bypass",
          "-Command",
          `Add-MpPreference -ExclusionPath '${String(dir).replace(/'/g, "''")}' -ErrorAction Stop`
        ],
        { windowsHide: true, timeout: 15000 }
      );
      results.defender = true;
    } catch (err) {
      results.defender = false;
      notes.push("Defender: puede requerir ejecutar como administrador o tener la protección contra alteraciones desactivada.");
    }
  } else {
    notes.push("Defender: disponible solo en Windows.");
  }

  // GPU: preferencia de alto rendimiento para el javaw/java que de verdad lanza el juego.
  // El perfil guarda la ruta usada en el último lanzamiento; si no hay constancia, se
  // intentan las rutas habituales conocidas.
  if (process.platform === "win32") {
    const gpuValue = "GpuPreference=2;";
    const candidates = [profile.javaPath].filter(
      (p) => typeof p === "string" && p.length > 0 && fs.existsSync(p)
    );
    for (const p of [
      path.join(os.homedir(), "AppData", "Roaming", "Proyectados MC", "runtime", "temurin-17", "jdk-17", "bin", "javaw.exe"),
      path.join(os.homedir(), "AppData", "Roaming", "Proyectados MC", "runtime", "temurin-17", "jre-17", "bin", "javaw.exe"),
    ]) {
      if (fs.existsSync(p)) candidates.push(p);
    }
    if (candidates.length === 0) candidates.push("javaw.exe");
    let gpuOk = false;
    for (const javaw of candidates) {
      try {
        await execFileAsync(
          "reg.exe",
          ["add", "HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences", "/v", javaw, "/t", "REG_SZ", "/d", gpuValue, "/f"],
          { windowsHide: true, timeout: 10000 }
        );
        gpuOk = true;
        break;
      } catch { /* probar siguiente */ }
    }
    results.gpu = gpuOk;
    if (!gpuOk) notes.push("GPU: no se pudo registrar la preferencia de alto rendimiento para el java que usas.");
  } else {
    notes.push("GPU: ajuste disponible solo en Windows.");
  }

  // Plan de energía: alto rendimiento (HKCU/LOCAL; puede requerir admin en PCs gobernadas)
  if (process.platform === "win32") {
    try {
      await execFileAsync(
        "powercfg.exe",
        ["/setactive", "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"],
        { windowsHide: true, timeout: 10000 }
      );
      results.power = true;
    } catch (err) {
      results.power = false;
      notes.push("Energía: no se pudo activar el plan de alto rendimiento (requiere permisos de administrador en este equipo).");
    }
  } else {
    notes.push("Energía: ajuste disponible solo en Windows.");
  }

  return { ok: true, results, notes };
});

// Contenido de la instancia (mods, resource packs, shaders)
const CONTENT_FOLDERS = { mods: "mods", resourcepacks: "resourcepacks", shaderpacks: "shaderpacks" };
function contentDir(type) {
  const profile = readProfile();
  if (!profile || !profile.folder) return null;
  const folder = CONTENT_FOLDERS[type];
  if (!folder) return null;
  const dir = path.join(profile.folder, folder);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

ipcMain.handle("content:list", async () => {
  const profile = readProfile();
  if (!profile || !profile.folder) return { ok: false, error: "No hay instancia configurada." };
  const result = { ok: true };
  const allowedExt = {
    mods: [".jar", ".zip"],
    resourcepacks: [".zip", ".rar"],
    shaderpacks: [".zip", ".rar"],
  };
  for (const type of Object.keys(CONTENT_FOLDERS)) {
    try {
      const dir = path.join(profile.folder, CONTENT_FOLDERS[type]);
      await fs.promises.mkdir(dir, { recursive: true });
      const entries = await fs.promises.readdir(dir);
      const seen = new Set();
      const files = [];
      for (const f of entries) {
        if (f.startsWith(".")) continue;
        const ext = path.extname(f).toLowerCase();
        if (!(allowedExt[type] || []).includes(ext)) continue;
        const key = f.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          const st = await fs.promises.stat(path.join(dir, f));
          files.push({ name: f, size: st.size, mtime: st.mtimeMs });
        } catch { /* ignore */ }
      }
      files.sort((a, b) => a.name.localeCompare(b.name));
      result[type] = files;
    } catch {
      result[type] = [];
    }
  }
  return result;
});

ipcMain.handle("content:add", async (_e, type) => {
  if (!CONTENT_FOLDERS[type]) return { ok: false, error: "Tipo de contenido no válido." };
  const dir = contentDir(type);
  if (!dir) return { ok: false, error: "No hay instancia configurada." };
  const exts = type === "mods" ? ["jar", "zip"] : ["zip", "rar"];
  const res = await dialog.showOpenDialog(win, {
    title: "Selecciona archivos",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Archivos", extensions: exts }],
  });
  if (res.canceled || !res.filePaths || !res.filePaths.length) return { ok: true, added: [] };
  const allowedExt = type === "mods" ? [".jar", ".zip"] : [".zip", ".rar"];
  const added = [];
  for (const src of res.filePaths) {
    if (!allowedExt.includes(path.extname(src).toLowerCase())) continue;
    const dest = path.join(dir, path.basename(src));
    fs.copyFileSync(src, dest);
    added.push(path.basename(src));
  }
  return { ok: true, added };
});

ipcMain.handle("content:remove", (_e, type, file) => {
  if (!CONTENT_FOLDERS[type]) return { ok: false, error: "Tipo de contenido no válido." };
  const name = path.basename(String(file || ""));
  const allowedExt = type === "mods" ? [".jar", ".zip"] : [".zip", ".rar"];
  if (!name || !allowedExt.includes(path.extname(name).toLowerCase())) {
    return { ok: false, error: "Archivo no válido." };
  }
  const dir = contentDir(type);
  if (!dir) return { ok: false, error: "No hay instancia configurada." };
  const target = path.join(dir, name);
  try { if (fs.existsSync(target)) fs.rmSync(target, { force: true }); } catch (e) { return { ok: false, error: String(e && e.message ? e.message : e) }; }
  return { ok: true };
});

// ------------------------------------------------------------
//  IPC — instalación de la instancia (primera vez)
// ------------------------------------------------------------
ipcMain.handle("instance:install", async (_e, payload) => {
  const { dir, nick, ramGB } = payload && typeof payload === "object" ? payload : {};
  if (gameBusy) {
    return { ok: false, error: "Minecraft ya se está instalando o está en ejecución." };
  }
  if (typeof dir !== "string" || !dir || !path.isAbsolute(dir)) {
    return { ok: false, error: "La carpeta de instalación no es válida." };
  }
  if (typeof nick !== "string" || !/^\w{3,16}$/.test(nick.trim())) {
    return { ok: false, error: "El nombre de jugador no es válido." };
  }
  const cleanNick = nick.trim();
  const normalized = path.normalize(dir);
  const lower = normalized.toLowerCase();
  const driveRoot = path.parse(normalized).root;
  const forbidden = [
    process.env.SystemRoot,
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.ProgramData,
  ]
    .filter(Boolean)
    .map((p) => path.normalize(p).toLowerCase());
  if (lower === driveRoot.toLowerCase() || forbidden.some((f) => lower === f || lower.startsWith(f + "\\"))) {
    return { ok: false, error: "No se puede instalar en una carpeta del sistema." };
  }
  try {
    fs.mkdirSync(normalized, { recursive: true });
    const testFile = path.join(normalized, ".pmc-write-test");
    fs.writeFileSync(testFile, "ok", "utf8");
    fs.unlinkSync(testFile);
  } catch {
    return { ok: false, error: "No se puede escribir en la carpeta seleccionada." };
  }
  gameBusy = true;

  try {
    // Java 17: puede ser la del sistema, la ya descargada en la instancia
    // o, si no hay ninguna, el runtime oficial de Mojang (se descarga
    // antes de parchear Forge). Nunca se usa Java 21+ con Forge en este modpack.
    const hardware = {
      totalRamGB: Math.round((os.totalmem() / 1024 ** 3) * 2) / 2,
      freeRamGB: Math.round((os.freemem() / 1024 ** 3) * 10) / 10,
      cpuThreads: os.cpus().length,
      gpus: await detectGpus(),
    };
    const java = await resolveJava(dir, (text) =>
      send("install:progress", { pct: 4, text: text || "Preparando Java 17 (Temurin)..." })
    );

    const forge = CFG.FORGE_VERSION;
    send("install:progress", { pct: 3, text: `Preparando Forge ${forge}...` });

    send("install:progress", {
      pct: 6,
      text: java
        ? "Preparando las carpetas de la instancia..."
        : "No hay Java 17 instalada: se descargará automáticamente (unos 90 MB)...",
    });

    // Guardamos el perfil ANTES de lanzar, para que la próxima vez ya se cargue.
    // Se conserva lo que ya tuviera (volumen, skin, etc.).
    const totalRam = os.totalmem() / 1024 ** 3;
    let ram = parseFloat(ramGB) || CFG.DEFAULT_RAM_GB;
    ram = Math.max(2, Math.min(totalRam, ram));
    const profile = mergeProfile({
      nick: cleanNick,
      folder: dir,
      ram: String(ram),
      ramManual: false,
    });
    profile.forgeVersion = forge;
    writeProfile(profile);

    // Crea las carpetas base
    fs.mkdirSync(path.join(dir, "mods"), { recursive: true });
    fs.mkdirSync(path.join(dir, "config"), { recursive: true });

    // Descarga del modpack ANTES de instalar Forge. Si los mods no se pueden
    // bajar, la instalación se detiene con un mensaje claro: así el aviso de
    // "Versión instalada" sólo aparece cuando todo está realmente listo.
    let packVersion = "";
    if (CFG.GITHUB.enabled) {
      send("install:progress", { pct: 8, text: "Buscando el manifiesto del modpack..." });
      try {
        const manifest = await fetchManifest(CFG.GITHUB);
        // Comprobar espacio libre antes de descargar
        const norm = normalizeManifest(manifest);
        const needed = norm.mods.concat(norm.configs).reduce((s, e) => s + (Number(e.size) || 0), 0) * 1.2;
        const free = freeSpaceBytes(dir);
        if (free !== null && needed > 0 && free < needed) {
          const err = new Error(`No hay espacio suficiente en disco. Faltan ${Math.round((needed - free) / 1024 ** 2)} MB.`);
          err.code = "ENOSPC";
          throw err;
        }
        await applyManifest(manifest, dir, (frac, text) =>
          send("install:progress", { pct: 8 + frac * 22, text })
        );
        packVersion = manifest.version || "";
      } catch (err) {
        if (err && err.code === "ENOSPC") throw err;
        console.warn("[Launcher] Manifiesto falló, usando zip:", err && err.message);
        const info = await downloadModpackWithRetry(dir, (frac, text) =>
          send("install:progress", { pct: 8 + frac * 22, text })
        );
        packVersion = info.version;
      }
      profile.lastModpackVersion = packVersion;
      writeProfile(profile);
      send("install:progress", {
        pct: 29,
        text: "Mods instalados. Preparando Minecraft y Forge...",
      });
    }

    send("install:progress", {
      pct: 30,
      text: `Instalando Minecraft ${CFG.MINECRAFT_VERSION} + Forge ${forge}. Esto puede tardar varios minutos...`,
    });

    // Sólo se prepara la instancia (Minecraft + Forge + mods). NO se abre el
    // juego: el jugador pulsa "Jugar" cuando quiera.
    await prepareWithRetry(
      {
        dir,
        nick: cleanNick,
        ramGB: ram,
        mcVersion: CFG.MINECRAFT_VERSION,
        forgeVersion: forge,
        perfLevel: profile.perfLevel,
        hardware,
        // null => minecraft-java-core descarga Java 17 (java-runtime-beta).
        javaPath: java ? java.path : null,
        // La preparación (5-97 %) ocupa el tramo 30-96 % de la barra.
        onProgress: (pct, text) => send("install:progress", { pct: 30 + pct * 0.66, text }),
      },
      (text) => send("install:progress", { pct: 30, text })
    );

    // Instalación completa: se deja la huella y se marca como instalada.
    writeInstanceMarker(dir, {
      modpackVersion: packVersion || profile.lastModpackVersion || "",
      forgeVersion: forge,
      minecraftVersion: CFG.MINECRAFT_VERSION,
      installedAt: new Date().toISOString(),
    });
    profile.installed = true;
    writeProfile(profile);

    gameBusy = false;
    send("install:progress", { pct: 100, text: "¡Versión instalada!" });

    return {
      ok: true,
      installed: true,
      version: packVersion || profile.lastModpackVersion || "",
      forgeVersion: forge,
      minecraftVersion: CFG.MINECRAFT_VERSION,
    };
  } catch (err) {
    gameBusy = false;
    console.error(err);
    const detail = String(err && err.message ? err.message : err);
    return { ok: false, error: err && err.code === "ENOSPC" ? detail : friendlyGameError(detail), detail };
  }
});

// ------------------------------------------------------------
//  IPC — lanzar el juego
// ------------------------------------------------------------
ipcMain.handle("instance:launch", async () => {
  if (gameBusy) {
    return { ok: false, error: "Minecraft ya se está abriendo o está en ejecución." };
  }

  const profile = readProfile();
  if (!profile || !profile.folder) {
    return { ok: false, error: "No hay ninguna instancia configurada." };
  }
  // Ajustar RAM fuera de rango en perfiles antiguos
  if (profile.ram) {
    const totalRam = os.totalmem() / 1024 ** 3;
    let r = parseFloat(profile.ram) || CFG.DEFAULT_RAM_GB;
    r = Math.max(2, Math.min(totalRam, r));
    profile.ram = String(r);
  }

  // La carpeta pudo borrarse o moverse desde la última vez.
  if (!isInstanceReady(profile.folder, CFG.MINECRAFT_VERSION)) {
    if (profile.installed) {
      profile.installed = false;
      writeProfile(profile);
    }
    return {
      ok: false,
      needsInstall: true,
      error: "La carpeta de la instancia ya no existe o está incompleta. Vuelve a instalarla.",
    };
  }
  // Copiar skin/capa a la instancia (CustomSkinLoader las carga directamente)
  writeSkinToInstance(profile);

  gameBusy = true;
  let failed = "";
  // Timeout solo para la fase de arranque: si el juego no arranca en 10 min,
  // se libera gameBusy para no bloquear el launcher. No aplica mientras
  // el juego está en ejecución.
  const startupTimer = setTimeout(() => {
    if (gameBusy) {
      gameBusy = false;
      send("launch:error", {
        message: "El arranque de Minecraft tardó demasiado. Puedes volver a intentarlo.",
        detail: "startup timeout",
        tail: "",
        log: "",
      });
    }
  }, 10 * 60 * 1000);

  try {
    // Java 17 (instancia o sistema). Si no hay, la librería descargará el
    // runtime oficial de Mojang antes de parchear/arrancar.
    const hardware = {
      totalRamGB: Math.round((os.totalmem() / 1024 ** 3) * 2) / 2,
      freeRamGB: Math.round((os.freemem() / 1024 ** 3) * 10) / 10,
      cpuThreads: os.cpus().length,
      gpus: await detectGpus(),
    };
    const java = await resolveJava(profile.folder, (text) =>
      send("install:progress", { pct: 4, text: text || "Preparando Java 17 (Temurin)..." })
    );
    if (java && java.path && profile.javaPath !== java.path) {
      profile.javaPath = java.path;
      writeProfile(profile);
    }
    if (!java) {
      send("install:progress", {
        pct: 4,
        text: "No hay Java 17 instalada: se descargará automáticamente (unos 90 MB)...",
      });
    }

    // Forge fijo para el modpack (todos los jugadores usan el mismo).
    const forge = CFG.FORGE_VERSION;
    if (profile.forgeVersion !== forge) {
      profile.forgeVersion = forge;
      writeProfile(profile);
    }

    // Solo se aplica si el usuario fijó un volumen de forma explícita (evita pisar el del juego).
    const volume = Number(profile.volume);
    if (profile.volumeManual === true && Number.isFinite(volume)) {
      applyGameVolume(profile.folder, volume);
    }

    let effectiveRam = parseFloat(profile.ram) || CFG.DEFAULT_RAM_GB;
    const totalRam = os.totalmem() / 1024 ** 3;
    effectiveRam = Math.max(2, Math.min(totalRam, effectiveRam));

    const client = await launchInstance({
      dir: profile.folder,
      nick: profile.nick,
      ramGB: effectiveRam,
      javaPath: java ? java.path : null,
      mcVersion: CFG.MINECRAFT_VERSION,
      forgeVersion: forge,
      perfLevel: profile.perfLevel,
      hardware,
      onProgress: (pct, text) => send("install:progress", { pct, text }),
      onOOM: () => {
        send("launch:oom", { message: "Minecraft se quedó sin memoria (OutOfMemoryError). Prueba a aumentar la RAM asignada." });
        dialog.showMessageBox(win, {
          type: "warning",
          title: "Sin memoria",
          message: "Minecraft se quedó sin memoria (OutOfMemoryError).",
          detail: "Prueba a aumentar la RAM asignada en Opciones y vuelve a lanzar el juego.",
        });
      },
      onLaunched: () => {
        clearTimeout(startupTimer);
        gameRunning = true;
        send("game:launched", { firstTime: false });
        applyAfterLaunch();
      },
      onError: (message, info) => {
        clearTimeout(startupTimer);
        failed = message;
        gameBusy = false;
        reportGameError("launch:error", message, info);
      },
    });

    if (client && client.on) {
      client.on("close", (code) => {
        clearTimeout(startupTimer);
        gameBusy = false;
        gameRunning = false;
        send("launch:closed", { code });
        setTimeout(() => {
          if (!win || win.isDestroyed()) createWindow();
          else {
            win.show();
            win.focus();
          }
        }, 500);
      });
    }
    return failed ? { ok: false, error: friendlyGameError(failed), detail: failed } : { ok: true };
  } catch (err) {
    clearTimeout(startupTimer);
    gameBusy = false;
    console.error(err);
    const detail = String(err && err.message ? err.message : err);
    return { ok: false, error: friendlyGameError(detail), detail };
  }
});

// ------------------------------------------------------------
//  IPC — actualizaciones del modpack (version.json de GitHub)
// ------------------------------------------------------------
ipcMain.handle("updates:check", async () => {
  if (!CFG.GITHUB.enabled) return { available: false, disabled: true };

  const profile = readProfile() || {};
  // Sin una instancia válida no se calcula ningún diff (ni se escanea el cwd).
  if (!profileInstanceReady(profile)) {
    return { available: false, noInstance: true, local: normalizeVersion(profile.lastModpackVersion) };
  }
  try {
    const manifest = await fetchManifest(CFG.GITHUB);
    const diff = computeDiff(manifest, profile.folder || "");
    const local = normalizeVersion(profile.lastModpackVersion);
    const remote = normalizeVersion(manifest.version);
    const hasDiff = diff.mods.add.length || diff.mods.update.length ||
      diff.configs.add.length || (diff.configs.forced || []).length;
    const available = !local || remote !== local || hasDiff;
    return {
      available,
      version: manifest.version,
      local,
      summary: diff.summary,
      notes: "Nuevos: " + diff.summary.mods.new + ", actualizados: " + diff.summary.mods.updated + ", eliminados: " + diff.summary.mods.removed,
    };
  } catch (err) {
    const info = await fetchLatestVersion(CFG.GITHUB);
    if (!info || !info.version) return { available: false, offline: true };
    const local = normalizeVersion(profile.lastModpackVersion);
    const remote = normalizeVersion(info.version);
    const available = !local || remote !== local;
    return { available, version: info.version, local, size: info.size || 0, notes: info.notes || "" };
  }
});

ipcMain.handle("updates:apply", async () => {
  const profile = readProfile();
  if (!profile || !profile.folder) return { ok: false, error: "No hay ninguna instancia instalada." };
  if (!isInstanceReady(profile.folder, CFG.MINECRAFT_VERSION)) {
    if (profile.installed) {
      profile.installed = false;
      writeProfile(profile);
    }
    return {
      ok: false,
      needsInstall: true,
      error: "La carpeta de la instancia ya no existe. Vuelve a instalarla.",
    };
  }
  if (!CFG.GITHUB.enabled) return { ok: false, error: "Las actualizaciones estan desactivadas." };

  try {
    send("install:progress", { pct: 1, text: "Comprobando la ultima version del modpack..." });
    let version = "";
    try {
      const manifest = await fetchManifest(CFG.GITHUB);
      const norm = normalizeManifest(manifest);
      const needed = norm.mods.concat(norm.configs).reduce((s, e) => s + (Number(e.size) || 0), 0) * 1.2;
      const free = freeSpaceBytes(profile.folder);
      if (free !== null && needed > 0 && free < needed) {
        return { ok: false, error: `No hay espacio suficiente en disco. Faltan ${Math.round((needed - free) / 1024 ** 2)} MB.` };
      }
      await applyManifest(manifest, profile.folder, (frac, text) =>
        send("install:progress", { pct: 2 + frac * 96, text })
      );
      version = manifest.version;
    } catch (err) {
      if (err && err.code === "ENOSPC") throw err;
      console.warn("[Launcher] Manifesto fallo, usando zip:", err && err.message);
      const info = await fetchLatestVersion(CFG.GITHUB);
      if (!info || !info.downloadUrl) {
        return { ok: false, error: "No pude consultar la nueva version del modpack." };
      }
      await installModpack(info, profile.folder, (frac, text) =>
        send("install:progress", { pct: 2 + frac * 96, text })
      );
      version = info.version;
    }

    profile.lastModpackVersion = version;
    profile.installed = true;
    writeProfile(profile);
    writeInstanceMarker(profile.folder, {
      modpackVersion: version,
      forgeVersion: CFG.FORGE_VERSION,
      minecraftVersion: CFG.MINECRAFT_VERSION,
    });
    send("install:progress", { pct: 100, text: "Modpack actualizado!" });
    return { ok: true, version };
  } catch (err) {
    console.error(err);
    const detail = String(err && err.message ? err.message : err);
    return { ok: false, error: err && err.code === "ENOSPC" ? detail : friendlyGameError(detail), detail };
  }
});

// Abrir la carpeta de la instancia desde el launcher

// Abrir URL externa en el navegador del sistema
ipcMain.handle("app:open-external", (_e, url) => {
  if (typeof url !== "string") return false;
  return openExternalUrl(url);
});

// Abrir la carpeta de la instancia desde el launcher
ipcMain.handle("instance:open-folder", () => {
  const profile = readProfile();
  if (profile && profile.folder && fs.existsSync(profile.folder)) {
    shell.openPath(profile.folder);
    return true;
  }
  return false;
});