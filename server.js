// Nova Call Eval — proxy + static host + GitHub-versioned content (Render-ready)
// The repo IS the source of truth: prompts/configs/KBs live in this repo, deploy with
// the app, and the server reads them from its own filesystem and serves them to the tool.
// Push a new version → Render redeploys → it appears in the dropdowns. No tokens, no
// public fetch of private files. Versioning = git history + filename (v1.md, v2.md ...).
//
//   npm install ; export ANTHROPIC_API_KEY=sk-ant-... ; npm start  → http://localhost:3000
//
const express = require("express");
const path = require("path");
const fs = require("fs");
const app = express();

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL   = process.env.NOVA_JUDGE_MODEL || "claude-sonnet-4-6";
const PORT    = process.env.PORT || 3000;
const ROOT    = __dirname;
const ACCESS  = process.env.NOVA_ACCESS_SECRET || ""; // if set, all /api/* calls require this secret
if (!API_KEY) { console.error("Set ANTHROPIC_API_KEY before starting."); process.exit(1); }

app.use(express.json({ limit: "10mb" }));

// Shared-secret gate: if NOVA_ACCESS_SECRET is set, every /api/* call must send it.
// The page sends it as the "x-nova-secret" header. No secret set = open (dev only).
app.use("/api", (req, res, next) => {
  if (!ACCESS) return next();
  if (req.get("x-nova-secret") === ACCESS) return next();
  return res.status(401).json({ error: { message: "unauthorized: missing or wrong access secret" } });
});

const safe = s => /^[a-z0-9._-]+$/i.test(s || "");

// List available versioned content by scanning the repo folders.
app.get("/api/manifest", (req, res) => {
  try {
    const out = { prompts: {}, kb: [], configs: [] };
    const pdir = path.join(ROOT, "prompts");
    if (fs.existsSync(pdir)) {
      fs.readdirSync(pdir, { withFileTypes: true }).filter(d => d.isDirectory()).forEach(d => {
        out.prompts[d.name] = fs.readdirSync(path.join(pdir, d.name))
          .filter(f => f.endsWith(".md")).map(f => f.replace(/\.md$/, "")).sort();
      });
    }
    const kdir = path.join(ROOT, "kb");
    if (fs.existsSync(kdir)) out.kb = fs.readdirSync(kdir).filter(f => f.endsWith(".md")).map(f => f.replace(/\.md$/, "")).sort();
    const cdir = path.join(ROOT, "configs");
    if (fs.existsSync(cdir)) out.configs = fs.readdirSync(cdir).filter(f => f.endsWith(".json")).map(f => f.replace(/\.json$/, "")).sort();
    res.json(out);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Serve a specific versioned file (path-traversal guarded).
app.get("/api/file", (req, res) => {
  const { type, flow, version } = req.query;
  if (!safe(version)) return res.status(400).json({ error: "bad version" });
  let p;
  if (type === "prompt") { if (!safe(flow)) return res.status(400).json({ error: "bad flow" }); p = path.join(ROOT, "prompts", flow, version + ".md"); }
  else if (type === "kb") { p = path.join(ROOT, "kb", version + ".md"); }
  else if (type === "config") { p = path.join(ROOT, "configs", version + ".json"); }
  else return res.status(400).json({ error: "bad type" });
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) return res.status(404).json({ error: "not found" });
  res.type(type === "config" ? "application/json" : "text/plain").send(fs.readFileSync(p, "utf8"));
});

// Serve the tool; inject endpoint + repo flag so the page wires itself up.
app.get("/", (req, res) => {
  let html = fs.readFileSync(path.join(ROOT, "nova_call_eval.html"), "utf8");
  const inject = `<script>window.NOVA_EVAL_ENDPOINT="/api/eval";window.NOVA_JUDGE_MODEL=${JSON.stringify(MODEL)};window.NOVA_HAS_REPO=true;window.NOVA_AUTH_REQUIRED=${ACCESS?"true":"false"};</script>`;
  html = html.replace("</head>", inject + "</head>");
  res.type("html").send(html);
});
app.use(express.static(ROOT));

// Eval proxy — holds the key server-side, passes upstream errors through.
app.post("/api/eval", async (req, res) => {
  try {
    const body = { ...req.body, model: req.body.model || MODEL, max_tokens: req.body.max_tokens || 4000 };
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    res.status(r.status).type("application/json").send(txt);
  } catch (e) {
    console.error("proxy_failed:", e);
    res.status(502).json({ error: { message: "proxy_failed: " + (e && e.message ? e.message : String(e)) } });
  }
});

app.listen(PORT, () => console.log(`Nova Eval running → http://localhost:${PORT}`));
