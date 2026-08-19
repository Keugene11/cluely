// Guide accuracy simulator. Renders a mock video editor, reads the true button
// boxes from the DOM, screenshots it, then asks /api/guide several questions and
// checks whether the returned cursor point lands inside the correct button.
//
// Run with: electron scripts/sim/run.js   (needs `next dev` on :3000)
const { app, BrowserWindow, session } = require("electron");
const path = require("node:path");

const ORIGIN = "http://localhost:3000";
const EDITOR = "file://" + path.join(__dirname, "editor.html").replace(/\\/g, "/");

// Each case: the question, and the DOM selectors whose boxes count as a hit.
const CASES = [
  { q: "how do I export this video?", accept: [".btn-export", ".pages .page:nth-child(5)"] },
  { q: "where do I add effects to a clip?", accept: [".rail .tool:nth-child(2)"] },
  { q: "how do I play the video to preview it?", accept: [".transport .play"] },
  { q: "how do I switch to color grading?", accept: [".pages .page:nth-child(3)"] },
  { q: "where do I change the opacity of a clip?", accept: [".inspector .field:nth-child(4)"] },
  { q: "where is the media pool with my clips?", accept: [".pool"] },
];

const ALL_SELECTORS = [...new Set(CASES.flatMap((c) => c.accept))];

function inBox(pt, box, margin = 0.02) {
  return (
    pt.x >= box.x0 - margin &&
    pt.x <= box.x1 + margin &&
    pt.y >= box.y0 - margin &&
    pt.y <= box.y1 + margin
  );
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_w, _p, cb) => cb(true));

  // Window B: render the mock editor, measure boxes, screenshot.
  const editor = new BrowserWindow({ width: 1440, height: 900, show: false });
  await editor.loadURL(EDITOR);
  await new Promise((r) => setTimeout(r, 600));

  const boxes = await editor.webContents.executeJavaScript(`
    (() => {
      const W = innerWidth, H = innerHeight;
      const sels = ${JSON.stringify(ALL_SELECTORS)};
      const out = {};
      for (const sel of sels) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        out[sel] = { x0: r.left/W, y0: r.top/H, x1: r.right/W, y1: r.bottom/H };
      }
      return out;
    })()
  `);

  const shot = await editor.webContents.capturePage();
  const dataUrl = shot.toDataURL();

  // Window A: same-origin so the auth cookie and /api/guide fetch work.
  const api = new BrowserWindow({ width: 400, height: 300, show: false });
  await api.loadURL(ORIGIN + "/login");

  const email = "sim-" + Date.now() + "@test.dev";
  await api.webContents.executeJavaScript(`
    fetch("/api/auth/signup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ${JSON.stringify(email)}, password: "testpass123", name: "Sim" })
    }).then(r => r.ok)
  `);

  let hits = 0;
  console.log("\n=== Guide accuracy simulator ===\n");

  for (const c of CASES) {
    const res = await api.webContents.executeJavaScript(`
      fetch("/api/guide", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: ${JSON.stringify(c.q)}, image: ${JSON.stringify(dataUrl)} })
      }).then(r => r.json())
    `);

    const point = res?.result?.point;
    if (!point) {
      console.log(`MISS  "${c.q}"\n      → no point returned (label: ${res?.result?.say?.slice(0, 60) ?? "?"})`);
      continue;
    }

    const targets = c.accept.map((s) => boxes[s]).filter(Boolean);
    const hit = targets.some((b) => inBox(point, b));
    if (hit) hits++;

    // Distance from the nearest target center, for a sense of how close a miss was.
    const nearest = targets
      .map((b) => Math.hypot(point.x - (b.x0 + b.x1) / 2, point.y - (b.y0 + b.y1) / 2))
      .sort((a, b) => a - b)[0];

    console.log(
      `${hit ? "HIT " : "MISS"}  "${c.q}"\n` +
        `      → point (${point.x.toFixed(2)}, ${point.y.toFixed(2)}) "${point.label}"  ` +
        `dist-to-center ${nearest?.toFixed(3)}`,
    );
  }

  console.log(`\n=== ${hits}/${CASES.length} landed inside the target ===\n`);
  app.exit(hits === CASES.length ? 0 : 2);
});
