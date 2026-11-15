// Comprueba la app empaquetada (asar) por CDP: UI, preload y Java.
const fs = require("fs");
const http = require("http");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function get(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

(async () => {
  const port = process.argv[2] || "9224";
  let targets = null;
  for (let i = 0; i < 60; i++) {
    try {
      targets = JSON.parse(await get(`http://127.0.0.1:${port}/json`));
      if (targets.some((t) => t.type === "page")) break;
    } catch {
      /* aún arrancando */
    }
    await sleep(500);
  }
  if (!targets) throw new Error("No pude conectar con la app empaquetada");

  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("No hay página");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  const call = (method, params = {}) =>
    new Promise((resolve) => {
      const i = ++id;
      pending.set(i, resolve);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async (expression) => {
    const res = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (res.result && res.result.exceptionDetails) throw new Error(JSON.stringify(res.result.exceptionDetails));
    return res.result && res.result.result ? res.result.result.value : undefined;
  };

  // Espera a que la UI termine de arrancar.
  let info = null;
  for (let i = 0; i < 20; i++) {
    await sleep(400);
    info = await evaluate(`(async () => ({
      screen: document.body.dataset.screen,
      title: document.title,
      api: typeof window.api,
      on: typeof (window.api && window.api.on),
      status2: (document.getElementById('status2') || {}).textContent,
      btnMain: (document.getElementById('btnMain') || {}).textContent,
      java: window.api ? await window.api.detectJava() : null,
    }))()`);
    if (info && info.screen && info.java) break;
  }

  console.log(JSON.stringify(info, null, 2));

  const shot = await call("Page.captureScreenshot", { format: "png" });
  if (shot.result && shot.result.data) {
    const out = process.argv[3];
    if (out) {
      fs.writeFileSync(out, Buffer.from(shot.result.data, "base64"));
      console.log("Captura:", out);
    }
  }

  ws.close();
  const ok =
    info &&
    info.api === "object" &&
    info.on === "function" &&
    info.java &&
    info.java.version === 17 &&
    ["s-home", "s-folder", "s-options", "s-logs", "s-content", "s-about"].includes(info.screen);
  process.exit(ok ? 0 : 1);
})().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(2);
});
