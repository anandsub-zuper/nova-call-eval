// Nova Call Eval — production proxy + static host (Render-ready)
// Holds the Anthropic API key server-side (never in the browser) and serves the tool.
// The page and the /api/eval proxy share one origin, so there is no CORS to configure.
//
//   npm install
//   export ANTHROPIC_API_KEY=sk-ant-...
//   npm start            → http://localhost:3000
//
const express = require("express");
const path = require("path");
const fs = require("fs");
const app = express();

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL   = process.env.NOVA_JUDGE_MODEL || "claude-sonnet-4-6"; // override via env if you prefer another judge
const PORT    = process.env.PORT || 3000;                            // Render sets PORT for you

if (!API_KEY) { console.error("Set ANTHROPIC_API_KEY before starting."); process.exit(1); }

app.use(express.json({ limit: "10mb" }));

// Serve the tool and inject the proxy endpoint so the HTML needs no edits.
app.get("/", (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, "nova_call_eval.html"), "utf8");
  const inject = `<script>window.NOVA_EVAL_ENDPOINT="/api/eval";window.NOVA_JUDGE_MODEL=${JSON.stringify(MODEL)};</script>`;
  html = html.replace("</head>", inject + "</head>");
  res.type("html").send(html);
});

// Any other static assets (none required, but harmless).
app.use(express.static(__dirname));

// Eval proxy: browser POSTs the Anthropic message body; we add the key and forward.
app.post("/api/eval", async (req, res) => {
  try {
    const body = { ...req.body, model: req.body.model || MODEL, max_tokens: req.body.max_tokens || 2000 };
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    // Pass the upstream status and body straight through so the page shows the real error.
    res.status(r.status).type("application/json").send(txt);
  } catch (e) {
    console.error("proxy_failed:", e);
    res.status(502).json({ error: { message: "proxy_failed: " + (e && e.message ? e.message : String(e)) } });
  }
});

app.listen(PORT, () => console.log(`Nova Eval running → http://localhost:${PORT}`));
