// Verifies the step-by-step walkthrough: ask a task, then advance a step on a
// fresh screenshot. Modeled on run.js (two windows: editor + same-origin API).
const { app, BrowserWindow, session } = require("electron");
const path = require("node:path");

const ORIGIN = "http://localhost:3000";
const EDITOR = "file://" + path.join(__dirname, "editor.html").replace(/\\/g, "/");

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_w, _p, cb) => cb(true));

  const editor = new BrowserWindow({ width: 1440, height: 900, show: false });
  await editor.loadURL(EDITOR);
  await new Promise((r) => setTimeout(r, 600));
  const dataUrl = (await editor.webContents.capturePage()).toDataURL();

  const api = new BrowserWindow({ width: 400, height: 300, show: false });
  await api.loadURL(ORIGIN + "/login");
  const email = "wk-" + Date.now() + "@test.dev";
  await api.webContents.executeJavaScript(`
    fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ${JSON.stringify(email)}, password: "testpass123", name: "W" }) }).then(r => r.ok)
  `);

  const callGuide = (body) =>
    api.webContents.executeJavaScript(`
      fetch("/api/guide", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(${JSON.stringify({ ...body, image: dataUrl })}) }).then(r => r.json())
    `);

  console.log("\n=== Walkthrough test ===\n");

  const first = (await callGuide({ question: "how do I export my video?" })).result;
  console.log("STEP 1 say:", first.say);
  console.log("  steps:", JSON.stringify(first.steps));
  console.log("  point:", JSON.stringify(first.point), "done:", first.done);

  const second = (
    await callGuide({ goal: "how do I export my video?", steps: first.steps, stepIndex: 1 })
  ).result;
  console.log("\nSTEP 2 say:", second.say);
  console.log("  point:", JSON.stringify(second.point), "done:", second.done);
  console.log("  steps kept stable:", JSON.stringify(second.steps) === JSON.stringify(first.steps));

  const ok =
    Array.isArray(first.steps) &&
    first.steps.length >= 2 &&
    typeof first.done === "boolean" &&
    typeof second.say === "string";
  console.log("\n=== " + (ok ? "PASS" : "FAIL") + " ===\n");
  app.exit(ok ? 0 : 2);
});
setTimeout(() => process.exit(1), 40000);
