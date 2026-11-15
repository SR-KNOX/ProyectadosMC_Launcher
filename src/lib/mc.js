// ============================================================
//  Instalación y lanzamiento de Minecraft + Forge
//  Usa la librería "minecraft-java-core" (Luuxis)
// ============================================================
const { Launch, Mojang } = require("minecraft-java-core");
const CFG = require("../config");

function atomicWriteFileSync(file, data) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = file + ".tmp";
  const bak = file + ".bak";
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
        const start = Date.now();
        while (Date.now() - start < 100 * (attempt + 1)) { /* busy wait */ }
        continue;
      }
      try { fs.writeFileSync(file, data, "utf8"); return true; } catch { return false; }
    }
  }
  return false;
}
const profiles = require("./jvm-profiles").profiles;
const { selectProfile } = require("./jvm-profiles");
const { profiles: gameSettingsProfiles } = require("./game-settings-profiles");
const path = require("path");
const fs = require("fs");

// ------------------------------------------------------------
//  Texto legible de cualquier error de la librería
// ------------------------------------------------------------
function normalizeError(err) {
  if (!err) return "Error desconocido";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message || String(err);
  if (typeof err.error === "string") return err.error;
  if (err.error && typeof err.error.message === "string") return err.error.message;
  if (typeof err.message === "string") return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

// ------------------------------------------------------------
//  Protección contra el crash del patcher de Forge
//
//  minecraft-java-core 4.2.9 lanza el error del patcher con
//  `forge.emit('error', ...)`, pero el Loader no reenvía ese
//  evento y nadie lo escucha. Node lo convierte entonces en
//  ERR_UNHANDLED_ERROR y Electron muestra el diálogo de "A
//  JavaScript error occurred in the main process".
//
//  Aquí capturamos esos errores y los devolvemos como resultado
//  normal ({ error }) para que el flujo termine con un mensaje
//  claro en la interfaz. Además:
//   - se reintenta el parche una vez (fallos puntuales: antivirus,
//     archivo bloqueado, descarga a medias...),
//   - se conserva el texto del error al atravesar GetLoader.
// ------------------------------------------------------------
let coreHardened = false;

function hardenMinecraftCore() {
  if (coreHardened) return;
  coreHardened = true;

  try {
    const build = path.dirname(require.resolve("minecraft-java-core"));
    const ForgeMC = require(path.join(build, "Minecraft-Loader", "loader", "forge", "forge.js")).default;
    const MinecraftLoader = require(path.join(build, "Minecraft", "Minecraft-Loader.js")).default;
    const LoaderClass = require(path.join(build, "Minecraft-Loader", "index.js")).default;

    // 1) ForgeMC: capturar sus 'error' en vez de dejar que tumben la app.
    if (ForgeMC && ForgeMC.prototype && !ForgeMC.prototype.__proyectadosHarden) {
      const originalEmit = ForgeMC.prototype.emit;
      ForgeMC.prototype.emit = function (event, ...args) {
        if (event === "error") {
          this.__proyectadosError = args[0];
          return false;
        }
        return originalEmit.apply(this, [event, ...args]);
      };

      const wrap = (name, { retry = false } = {}) => {
        const original = ForgeMC.prototype[name];
        if (typeof original !== "function") return;
        ForgeMC.prototype[name] = async function (...args) {
          this.__proyectadosError = null;
          try {
            let result = await original.apply(this, args);
            if (this.__proyectadosError) {
              if (retry) {
                console.warn(
                  "[Forge] Falló el parche; reintentando una vez:",
                  normalizeError(this.__proyectadosError)
                );
                this.__proyectadosError = null;
                result = await original.apply(this, args);
              }
              if (this.__proyectadosError) {
                const message = normalizeError(this.__proyectadosError);
                // loader.forge() comprueba `patch.error`, y Launch necesita
                // `message` para no perder el texto al hacer err.message.
                return { error: message, message };
              }
            }
            return result;
          } catch (err) {
            const message = normalizeError(err);
            return { error: message, message };
          } finally {
            this.__proyectadosError = null;
          }
        };
      };

      wrap("patchForge", { retry: true });
      wrap("downloadLibraries");
      ForgeMC.prototype.__proyectadosHarden = true;
    }

    // 2) GetLoader rechaza con objetos { error }. Launch hace
    //    `err.message`, que sería undefined; lo convertimos a Error.
    if (
      MinecraftLoader &&
      MinecraftLoader.prototype &&
      !MinecraftLoader.prototype.__proyectadosHarden
    ) {
      const originalGetLoader = MinecraftLoader.prototype.GetLoader;
      MinecraftLoader.prototype.GetLoader = function (...args) {
        return originalGetLoader.apply(this, args).catch((err) => {
          throw new Error(normalizeError(err));
        });
      };
      MinecraftLoader.prototype.__proyectadosHarden = true;
    }

    // 3) Loader.install() se llama sin await/catch desde GetLoader. Si una
    //    promesa interna falla (p. ej. no puede copiar el jar de vanilla),
    //    se convertiría en un rechazo sin capturar y el flujo se quedaría
    //    colgado. Lo transformamos en un evento 'error' normal.
    if (LoaderClass && LoaderClass.prototype && !LoaderClass.prototype.__proyectadosHarden) {
      const originalInstall = LoaderClass.prototype.install;
      LoaderClass.prototype.install = function (...args) {
        return Promise.resolve()
          .then(() => originalInstall.apply(this, args))
          .catch((err) => {
            const message = normalizeError(err);
            console.error("[Minecraft] Falló la instalación del loader:", message);
            if (this.listenerCount("error") > 0) {
              // loader.install() comprueba `result.error`; `message` es para
              // que Launch no pierda el texto al hacer err.message.
              this.emit("error", { error: message, message });
            }
          });
      };
      LoaderClass.prototype.__proyectadosHarden = true;
    }
  } catch (err) {
    console.warn(
      "[Forge] No pude activar la captura de errores del patcher:",
      normalizeError(err)
    );
  }
}

hardenMinecraftCore();

// ------------------------------------------------------------
//  Log detallado del parche de Forge (stdout/stderr de los
//  procesadores). Se escribe en <instancia>/logs/forge-patch.log
// ------------------------------------------------------------
function createPatchLog(dir, onLine) {
  const file = path.join(dir, "logs", "forge-patch.log");
  let fd = null;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fd = fs.openSync(file, "w");
    fs.writeSync(fd, `Forge / Minecraft · ${new Date().toISOString()}\n\n`);
  } catch (err) {
    console.warn("No pude crear el log del parche:", err.message);
  }

  let tail = "";
  let lastLine = "";
  let lastSent = 0;
  let closed = false;

  return {
    file,

    push(data) {
      const s = String(data ?? "");
      if (!s) return;
      if (fd !== null) {
        try {
          fs.writeSync(fd, s);
        } catch {
          /* disco lleno / archivo bloqueado */
        }
      }
      tail = (tail + s).slice(-16000); // últimas ~16 KB para el mensaje de error

      // Progreso: solo la última línea, como mucho cada 500 ms.
      const lines = s.replace(/\r/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
      const line = lines.length ? lines[lines.length - 1] : "";
      const now = Date.now();
      if (line && line !== lastLine && now - lastSent > 500) {
        lastLine = line;
        lastSent = now;
        if (onLine) onLine(line.slice(0, 100));
      }
    },

    appendError(message) {
      if (fd !== null) {
        try {
          fs.writeSync(fd, `\n[ERROR] ${message}\n`);
        } catch {
          /* ignore */
        }
      }
    },

    tail() {
      return tail.slice(-6000);
    },

    close() {
      if (closed) return;
      closed = true;
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch {
          /* ignore */
        }
        fd = null;
      }
    },
  };
}

// ------------------------------------------------------------
//  Eventos comunes de instalación/lanzamiento
// ------------------------------------------------------------
function rotateLog(file, maxSize = 5 * 1024 * 1024, maxFiles = 3) {
  try {
    if (!fs.existsSync(file)) return;
    const size = fs.statSync(file).size;
    if (size < maxSize) return;
    for (let i = maxFiles - 1; i >= 1; i--) {
      const src = i === 1 ? file : file + "." + (i - 1);
      const dst = file + "." + i;
      if (fs.existsSync(src)) {
        try { fs.renameSync(src, dst); } catch { /* ignore */ }
      }
    }
    // If no numbered files, rename original to .1
    if (!fs.existsSync(file + ".1") && fs.existsSync(file)) {
      try { fs.renameSync(file, file + ".1"); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

function attachLauncherEvents(launcher, { dir, onProgress, onLaunched, onError }) {
  const log = createPatchLog(dir, (line) => {
    if (onProgress) onProgress(86, `Aplicando Forge: ${line}…`);
  });

  let launched = false;
  let lastError = "";

  launcher.on("patch", (data) => log.push(data));

  launcher.on("error", (err) => {
    const message = normalizeError(err);
    const tail = log.tail();
    log.appendError(message);
    log.close();
    console.error("[Minecraft] " + message);
    if (tail) console.error("[Minecraft] Últimas líneas del parche:\n" + tail);
    if (message !== lastError && onError) {
      lastError = message;
      onError(message, { logFile: log.file, tail });
    }
  });

  launcher.on("data", () => {
    if (launched) return;
    launched = true;
    log.close();
    if (onProgress) onProgress(97, "Iniciando el juego...");
    if (onLaunched) onLaunched();
  });

  launcher.on("close", () => log.close());

  return log;
}

// ------------------------------------------------------------
//  Verificación de la instancia
//  Sirve para detectar que la carpeta se borró (o quedó a medias)
//  y volver a ofrecer la instalación en lugar de bloquear el launcher.
// ------------------------------------------------------------
const INSTANCE_MARKER = ".proyectados-instance.json";

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isInstanceReady(dir, mcVersion = CFG.MINECRAFT_VERSION) {
  if (!dir || !isDir(dir)) return false;

  const hasVersion = isDir(path.join(dir, "versions", mcVersion));
  const hasLibraries = isDir(path.join(dir, "libraries"));
  const hasAssets = isDir(path.join(dir, "assets"));
  const hasMarker = fs.existsSync(path.join(dir, INSTANCE_MARKER));

  // Instancia completa: versión descargada + librerías o assets.
  if (hasVersion && (hasLibraries || hasAssets)) return true;
  // Instalación a medias con marcador: al menos algo real debe existir.
  return hasMarker && (hasVersion || hasLibraries);
}

/* Deja una huella de la instalación. Se escribe sólo cuando el proceso
   terminó bien, y se actualiza al instalar/actualizar el modpack. */
function writeInstanceMarker(dir, data = {}) {
  const file = path.join(dir, INSTANCE_MARKER);
  let current = {};
  try {
    current = JSON.parse(fs.readFileSync(file, "utf8")) || {};
  } catch {
    current = {};
  }

  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) clean[key] = value;
  }

  const next = { ...current, ...clean, updatedAt: new Date().toISOString() };
  atomicWriteFileSync(file, JSON.stringify(next, null, 2));
  return next;
}

// Convierte GB (admite decimales) a bytes para la JVM: Java RECHAZA "3.5G"
// ("Invalid initial heap size"), así que siempre usamos MB enteros.
function toMem(gb) {
  const n = Math.max(1, parseFloat(gb) || 4);
  return `${Math.round(n * 1024)}M`;
}

// ------------------------------------------------------------
//  Volumen del launcher -> volumen general del juego.
//  Minecraft guarda sus ajustes en options.txt; esta línea es
//  la del volumen maestro. Se escribe antes de arrancar el juego.
// ------------------------------------------------------------
function applyGameVolume(dir, volume) {
  try {
    const file = path.join(dir, "options.txt");
    const val = (Math.max(0, Math.min(100, Math.round(volume))) / 100).toFixed(2);
    let txt = "";
    try {
      txt = fs.readFileSync(file, "utf8");
    } catch {
      /* todavía no existe: se creará */
    }
    const line = `soundCategory_master:${val}`;
    if (/^soundCategory_master:[^\r\n]*/m.test(txt)) {
      txt = txt.replace(/^soundCategory_master:[^\r\n]*/m, line);
    } else {
      if (txt && !txt.endsWith("\n")) txt += "\n";
      txt += line + "\n";
    }
    atomicWriteFileSync(file, txt);
    return true;
  } catch (err) {
    console.warn("No se pudo aplicar el volumen al juego:", err.message);
    return false;
  }
}

// ------------------------------------------------------------
//  Ajustes de options.txt según perfil de hardware.
//  Solo cambia claves que sigan en su valor por defecto aplicado
//  previamente (no pisa ajustes manuales del jugador).
// ------------------------------------------------------------
function applyGameSettings(dir, profileName) {
  try {
    const profile = gameSettingsProfiles[profileName] || gameSettingsProfiles.medium;
    const file = path.join(dir, "options.txt");
    const stateFile = path.join(dir, ".options-profile.json");
    let txt = "";
    try {
      txt = fs.readFileSync(file, "utf8");
    } catch {
      /* se creará */
    }
    let state = { profile: null, defaults: {} };
    try {
      state = JSON.parse(fs.readFileSync(stateFile, "utf8")) || state;
    } catch {
      state = { profile: null, defaults: {} };
    }

    const current = {};
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^([^:]+):(.*)$/);
      if (m) current[m[1]] = m[2];
    }

    if (txt && !txt.endsWith("\\n")) txt += "\\n";
    for (const [key, value] of Object.entries(profile)) {
      const prevDefault = Object.prototype.hasOwnProperty.call(state.defaults, key)
        ? state.defaults[key]
        : undefined;
      if (!Object.prototype.hasOwnProperty.call(current, key)) {
        // Clave nueva: aplicar perfil
        txt += `${key}:${value}\\n`;
      } else if (prevDefault !== undefined && String(current[key]) === String(prevDefault)) {
        // Sigue en el default que aplicamos antes: actualizar al nuevo perfil
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        txt = txt.replace(new RegExp(`^${escaped}:[^\\r\\n]*`, "m"), `${key}:${value}`);
      }
      // Si el jugador lo cambió, no tocar
    }

    atomicWriteFileSync(file, txt);
    const newState = { profile: profileName, defaults: { ...profile } };
    atomicWriteFileSync(stateFile, JSON.stringify(newState, null, 2));
    return true;
  } catch (err) {
    console.warn("No se pudo aplicar ajustes del juego:", err.message);
    return false;
  }
}

// ------------------------------------------------------------
//  Cuenta offline a partir del Nick
// ------------------------------------------------------------
async function offlineAuth(nick) {
  const acc = await Mojang.login(nick); // sin password => cuenta offline
  return acc;
}

// ------------------------------------------------------------
//  Prepara la instancia (Minecraft + Forge) SIN abrir el juego.
//  Descarga todo, parchea Forge y deja los archivos listos para
//  que el jugador pulse "Jugar" cuando quiera.
//
//  javaPath puede ser null: en ese caso minecraft-java-core
//  descarga el runtime Java 17 de Mojang (java-runtime-beta) en
//  <instancia>/runtime y lo usa también para el patcher.
// ------------------------------------------------------------
// Perfil de rendimiento efectivo: lo que eligió el jugador (auto|low|medium|high)
// manda sobre la heurística automática por hardware.
function resolvePerfProfile(explicitLevel, hardware) {
  if (explicitLevel && explicitLevel !== "auto" && profiles[explicitLevel]) return explicitLevel;
  return selectProfile(hardware);
}

function resolveJvmArgs(options) {
  const explicit = options && options.perfLevel;
  const name =
    explicit && explicit !== "auto" && profiles[explicit]
      ? explicit
      : selectProfile(options && options.hardware);
  const profile = profiles[name] || profiles.medium;
  return profile.args.slice();
}

async function prepareInstance({
  dir,
  nick,
  ramGB,
  mcVersion,
  forgeVersion,
  javaPath,
  perfLevel,
  hardware,
  onProgress,
}) {
  hardenMinecraftCore();
  const auth = await offlineAuth(nick);
  const launcher = new Launch();

  let failure = "";
  launcher.on("error", (err) => {
    failure = normalizeError(err);
  });
  launcher.on("progress", (progress, size, element) => {
    if (onProgress && size) {
      onProgress(5 + (progress / size) * 70, `Descargando ${element || "archivos"}...`);
    }
  });
  launcher.on("check", (progress, size, element) => {
    if (onProgress && size) {
      onProgress(75 + (progress / size) * 10, `Verificando ${element || ""}...`);
    }
  });
  launcher.on("patch", () => {
    if (onProgress) onProgress(90, "Parcheando Forge...");
  });

  const mem = toMem(ramGB);

  // La librería inicializa sus opciones dentro de Launch(), pero también
  // arranca el juego al final. Con este "start" vacío sólo preparamos.
  launcher.start = async () => {};

  try {
    await launcher.Launch({
      path: dir,
      version: mcVersion,
      authenticator: auth,
      loader: { type: "forge", build: forgeVersion, enable: true },
      java: { path: javaPath || null },
      memory: { min: toMem(Math.max(1, Math.floor(ramGB / 2))), max: mem },
      downloadFileMultiple: 8,
      ignore_log4j: true,
      JVM_ARGS: resolveJvmArgs({ perfLevel, hardware }),
    });

    const data = await launcher.DownloadGame();
    if (failure) throw new Error(failure);
    if (!data) throw new Error("No se pudo preparar la instancia de Minecraft.");

    applyGameSettings(dir, resolvePerfProfile(perfLevel, hardware));
    if (onProgress) onProgress(100, "Instancia preparada.");
    return launcher;
  } catch (err) {
    throw new Error(failure || normalizeError(err));
  }
}

// ------------------------------------------------------------
//  Lanza el juego con los mods ya instalados.
//  onLaunched se dispara cuando el juego arranca (no en cada línea).
// ------------------------------------------------------------
async function launchInstance({
  dir,
  nick,
  ramGB,
  javaPath,
  perfLevel,
  mcVersion,
  forgeVersion,
  hardware,
  onProgress,
  onLaunched,
  onError,
  onOOM,
}) {
  hardenMinecraftCore();
  const auth = await offlineAuth(nick);
  const launcher = new Launch();

  const profileName = resolvePerfProfile(perfLevel, hardware);
  const startTime = Date.now();
  let oomReported = false;
  const wrappedOnLaunched = () => {
    const loadTime = Date.now() - startTime;
    try {
      const logFile = path.join(dir, "logs", "load-times.log");
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
      rotateLog(logFile);
      fs.appendFileSync(
        logFile,
        `${new Date().toISOString()} profile=${profileName} ram=${ramGB}GB loadTimeMs=${loadTime}\n`,
        "utf8"
      );
    } catch {
      /* ignore */
    }
    if (onLaunched) onLaunched();
  };
  attachLauncherEvents(launcher, { dir, onProgress, onLaunched: wrappedOnLaunched, onError });

  // Salida del juego con buffer a archivo (evita I/O por línea)
  try {
    const outFile = path.join(dir, "logs", "game-output.log");
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    rotateLog(outFile);
    let buffer = "";
    const flush = () => {
      if (!buffer) return;
      try { fs.appendFileSync(outFile, buffer, "utf8"); } catch { /* ignore */ }
      if (!oomReported && /OutOfMemoryError|Java heap space/i.test(buffer)) {
        oomReported = true;
        if (onOOM) onOOM();
      }
      buffer = "";
    };
    const timer = setInterval(flush, 1000);
    launcher.on("data", (d) => { buffer += String(d ?? ""); });
    launcher.on("debug", (d) => { buffer += String(d ?? ""); });
    launcher.on("close", () => { flush(); clearInterval(timer); });
    launcher.on("error", () => { flush(); });
  } catch {
    /* ignore */
  }

  launcher.on("progress", (progress, size, element) => {
    if (onProgress && size) {
      onProgress(5 + (progress / size) * 70, `Descargando ${element || "archivos"}...`);
    }
  });
  launcher.on("check", (progress, size, element) => {
    if (onProgress && size) {
      onProgress(75 + (progress / size) * 10, `Verificando ${element || ""}...`);
    }
  });

  applyGameSettings(dir, profileName);
  const mem = toMem(ramGB);
  const memMin = toMem(Math.max(1, Math.floor(ramGB / 2)));
  // Capturar el PID del proceso del juego (no el primero que aparezca).
  const cp = require("child_process");
  const originalSpawn = cp.spawn;
  let gamePid = null;
  cp.spawn = function (...args) {
    let child;
    try {
      child = originalSpawn.apply(cp, args);
      const cmd = Array.isArray(args[1]) ? args[1].join(" ") : String(args[1] || "");
      if (child && child.pid) {
        if (/forgeclient|modlauncher|minecraft\.client/i.test(cmd)) {
          gamePid = child.pid;
        } else if (gamePid === null && cmd.length > 100) {
          gamePid = child.pid;
        }
      }
    } finally {
      // Restaurar siempre, incluso si spawn lanza.
      cp.spawn = originalSpawn;
    }
    return child;
  };

  const jvmArgs = resolveJvmArgs({ perfLevel, hardware }).concat([
    "-XX:-UseAdaptiveSizePolicy",
    "-XX:-OmitStackTraceInFastThrow",
  ]);
  try {
    await launcher.Launch({
      path: dir,
      version: mcVersion,
      authenticator: auth,
      loader: { type: "forge", build: forgeVersion, enable: true },
      java: { path: javaPath || null },
      memory: { min: memMin, max: mem },
      downloadFileMultiple: 8,
      ignore_log4j: true,
      detached: true, // proceso independiente: sobrevive al cierre del launcher
      JVM_ARGS: jvmArgs,
    });
  } catch (err) {
    const message = normalizeError(err);
    console.error("[Minecraft] " + message);
    if (onError) {
      onError(message, { logFile: path.join(dir, "logs", "forge-patch.log"), tail: "" });
    }
  }

  // Prioridad Above Normal para el proceso del juego (sin PowerShell).
  try {
    if (gamePid) {
      const os = require("os");
      os.setPriority(gamePid, os.constants.priority.PRIORITY_ABOVE_NORMAL);
    }
  } catch (err) {
    console.warn("No se pudo ajustar la prioridad del juego:", err && err.message ? err.message : err);
  }

  return launcher;
}

module.exports = {
  isInstanceReady,
  writeInstanceMarker,
  INSTANCE_MARKER,
  prepareInstance,
  launchInstance,
  applyGameVolume,
  normalizeError,
};
