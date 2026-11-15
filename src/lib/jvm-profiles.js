// Perfiles de flags de JVM para el cliente. Editar aquí.
const profiles = {
  low: {
    name: "Bajo",
    args: [
      "-XX:+UseG1GC",
      "-XX:+ParallelRefProcEnabled",
      "-XX:MaxGCPauseMillis=100",
      "-XX:+DisableExplicitGC",
      "-XX:G1MaxNewSizePercent=30",
      "-XX:G1HeapRegionSize=4M",
      "-XX:G1ReservePercent=15",
      "-XX:InitiatingHeapOccupancyPercent=20",
      "-XX:G1MixedGCCountTarget=4",
      "-XX:SurvivorRatio=8",
      "-XX:+PerfDisableSharedMem",
      "-XX:MaxTenuringThreshold=1",
      "-Dsun.rmi.dgc.server.gcInterval=2147483646",
      "-Dsun.rmi.dgc.client.gcInterval=2147483646",
    ],
  },
  medium: {
    name: "Medio",
    args: [
      "-XX:+UseG1GC",
      "-XX:+ParallelRefProcEnabled",
      "-XX:MaxGCPauseMillis=200",
      "-XX:+DisableExplicitGC",
      "-XX:G1NewSizePercent=30",
      "-XX:G1MaxNewSizePercent=40",
      "-XX:G1HeapRegionSize=8M",
      "-XX:G1HeapWastePercent=5",
      "-XX:G1MixedGCCountTarget=4",
      "-XX:InitiatingHeapOccupancyPercent=15",
      "-XX:G1MixedGCLiveThresholdPercent=90",
      "-XX:G1RSetUpdatingPauseTimePercent=5",
      "-XX:SurvivorRatio=32",
      "-XX:+PerfDisableSharedMem",
      "-XX:MaxTenuringThreshold=1",
      "-XX:+AlwaysPreTouch",
      "-XX:+UseStringDeduplication",
      "-Dsun.rmi.dgc.server.gcInterval=2147483646",
      "-Dsun.rmi.dgc.client.gcInterval=2147483646",
    ],
  },
  high: {
    name: "Alto",
    args: [
      "-XX:+UseG1GC",
      "-XX:+ParallelRefProcEnabled",
      "-XX:MaxGCPauseMillis=200",
      "-XX:+DisableExplicitGC",
      "-XX:+AlwaysPreTouch",
      "-XX:G1NewSizePercent=30",
      "-XX:G1MaxNewSizePercent=40",
      "-XX:G1HeapRegionSize=16M",
      "-XX:G1HeapWastePercent=5",
      "-XX:G1MixedGCCountTarget=4",
      "-XX:InitiatingHeapOccupancyPercent=15",
      "-XX:G1MixedGCLiveThresholdPercent=90",
      "-XX:G1RSetUpdatingPauseTimePercent=5",
      "-XX:SurvivorRatio=32",
      "-XX:+PerfDisableSharedMem",
      "-XX:MaxTenuringThreshold=1",
      "-XX:+UseStringDeduplication",
      "-Dsun.rmi.dgc.server.gcInterval=2147483646",
      "-Dsun.rmi.dgc.client.gcInterval=2147483646",
    ],
  },
};

function selectProfile(hardware) {
  const total = (hardware && hardware.totalRamGB) || 8;
  const threads = (hardware && hardware.cpuThreads) || 4;
  const hasDedicated = (hardware && Array.isArray(hardware.gpus)) ? hardware.gpus.some((g) => g.dedicated) : false;
  if (hasDedicated && total >= 12 && threads >= 8) return "high";
  if (total >= 8 && threads >= 4) return "medium";
  return "low";
}

module.exports = { profiles, selectProfile };