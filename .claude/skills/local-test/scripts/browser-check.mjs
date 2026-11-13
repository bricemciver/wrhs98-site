// Loads a page in headless Chromium as a signed-in user at several widths.
// Reports horizontal overflow (the page or any scroll container wider than it
// shows) and saves a screenshot per width.
//
// Usage: node browser-check.mjs <session-token> <path> [widths=1440,1280,1024,390] [out-dir=.]
// Example: node browser-check.mjs "$TOKEN" /admin/members 1280,390 "$SCRATCH"
// Needs Node 22+ (global WebSocket) and Chromium/Chrome. Set CHROME=/path/to/browser to override.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const [token, path, widthArg = "1440,1280,1024,390", outDir = "."] = process.argv.slice(2);
if (!token || !path) {
  console.error("usage: node browser-check.mjs <session-token> <path> [widths] [out-dir]");
  process.exit(2);
}
const BASE = process.env.BASE_URL ?? "http://localhost:5198";
const PORT = 9333;
const candidates = [process.env.CHROME, "/snap/bin/chromium", "/usr/bin/chromium", "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].filter(Boolean);
const chrome = candidates.find((c) => existsSync(c));
if (!chrome) throw new Error("No Chromium/Chrome found; set CHROME.");
// Snap Chromium can only write inside ~/snap/chromium.
const profile = chrome.startsWith("/snap/") ? join(homedir(), "snap/chromium/common/wrhs98-check") : join(outDir, ".chrome-profile");
mkdirSync(profile, { recursive: true });
const browser = spawn(chrome, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let ws;
  for (let i = 0; i < 80 && !ws; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === "page");
      if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
    } catch {}
    if (!ws) await sleep(250);
  }
  if (!ws) throw new Error("Chromium didn't start.");
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    pending.get(m.id)?.(m);
    pending.delete(m.id);
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result.result.value;

  await send("Page.enable");
  await send("Network.enable");
  await send("Network.setCookie", { name: "wrhs98_session", value: token, url: BASE });
  for (const width of widthArg.split(",").map(Number)) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    await send("Page.navigate", { url: BASE + path });
    await sleep(2500);
    const report = await evaluate(`(() => {
      const page = document.scrollingElement;
      const containers = [...document.querySelectorAll("*")]
        .filter((el) => el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX))
        .map((el) => ({ el: el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : ""), scroll: el.scrollWidth, client: el.clientWidth }));
      return { url: location.pathname + location.search, title: document.title, pageOverflow: page.scrollWidth > innerWidth, containers };
    })()`);
    const shot = await send("Page.captureScreenshot", { format: "png" });
    const file = join(outDir, `check-${path.replace(/\W+/g, "_")}-${width}.png`);
    writeFileSync(file, Buffer.from(shot.result.data, "base64"));
    console.log(JSON.stringify({ width, ...report, screenshot: file }));
  }
  ws.close();
} finally {
  browser.kill();
}
