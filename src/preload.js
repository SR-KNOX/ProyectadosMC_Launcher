// ============================================================
//  Puente seguro entre la interfaz (UI) y el proceso principal
// ============================================================
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // Ventana
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),

  // Perfil (nick, carpeta, RAM, skin, volumen, acción al abrir el juego…)
  getProfile: () => ipcRenderer.invoke("profile:get"),
  saveProfile: (p) => ipcRenderer.invoke("profile:save", p),
  pickFolder: () => ipcRenderer.invoke("profile:pick-folder"),

  // Datos del equipo (RAM total, CPU…)
  systemInfo: () => ipcRenderer.invoke("system:info"),

  // Java
  detectJava: () => ipcRenderer.invoke("java:detect"),

  // Instancia
  installInstance: (data) => ipcRenderer.invoke("instance:install", data),
  instanceStatus: () => ipcRenderer.invoke("instance:status"),
  launch: () => ipcRenderer.invoke("instance:launch"),
  openFolder: () => ipcRenderer.invoke("instance:open-folder"),
  optimizeEnvironment: () => ipcRenderer.invoke("env:optimize"),
  contentList: () => ipcRenderer.invoke("content:list"),
  contentAdd: (type) => ipcRenderer.invoke("content:add", type),
  contentRemove: (type, file) => ipcRenderer.invoke("content:remove", type, file),
  openExternal: (url) => ipcRenderer.invoke("app:open-external", url),

  // Actualizaciones
  checkUpdates: () => ipcRenderer.invoke("updates:check"),
  applyUpdate: () => ipcRenderer.invoke("updates:apply"),

  // Eventos desde el proceso principal
  on: (channel, cb) => {
    if (typeof cb !== "function") return;
    const allowed = [
      "install:progress",
      "install:error",
      "launch:error",
      "launch:oom",
      "game:launched",
      "launch:closed",
    ];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_e, data) => cb(data));
    }
  },
});
