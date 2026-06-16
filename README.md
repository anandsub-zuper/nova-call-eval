# Nova Call Eval — repo

Production eval tool for Zuper's Nova CSR Agent. The repo is the source of truth: prompts,
configs, and KBs are versioned files here, deployed with the app on Render. The server reads
them from its own filesystem and serves them to the tool — no GitHub tokens, no public fetch
of private files. Push a new version → Render redeploys → it appears in the dropdowns.

## Layout
```
server.js                      proxy + static host + versioning endpoints
nova_call_eval.html            the tool
package.json, render.yaml      deploy config
prompts/
  new-customer/v1.md           behavior-only prompt (no KB), versioned
  existing-customer/v1.md      (placeholder — add the real one)
kb/
  v1.md                        Knowledge Base, optional, shared across flows
configs/
  v4.json                      pipeline config snapshot, versioned
```

## Versioning workflow (this is the whole point)
- New prompt revision → add `prompts/new-customer/v2.md` (don't overwrite v1). Commit/push.
- New config → add `configs/v5.json`. New KB → add `kb/v2.md`.
- Render redeploys on push; the tool's Source dropdowns list every version automatically.
- Old versions stay forever, so you can always re-load and compare. Git history = audit trail.

## Deploy (Render)
1. Push this repo to GitHub.
2. Render → New → Blueprint → select the repo (reads render.yaml).
3. Add secret env var `ANTHROPIC_API_KEY`.
4. Open the URL. The **Source — GitHub-versioned** card appears at the top: pick New/Existing
   customer, a prompt version, optional KB version, and a config version, then **Load selected
   from repo**. It fills the boxes; paste a transcript and Run.

## Important: what an eval can and cannot prove
- **Config/turn-taking/latency fixes** (backchannel, temperature, EOT) can ONLY be validated on
  a NEW call placed AFTER the change. Re-scoring an OLD transcript with a new config label is
  fiction — the old transcript already baked in the old behavior. Tag those runs clearly.
- **Prompt fixes** can be sanity-checked against an old transcript (would the new prompt have
  behaved differently here?), but real proof is still a fresh call.
- Workflow: change → place/pull a NEW call → transcribe (Deepgram, with timestamps) → eval →
  compare to baseline in Run history.

## Auth (do before sharing)
The service is public by default and spends your Anthropic key. Front it with SSO/VPN, or add a
shared-secret header check in server.js, before sharing the URL or logging real calls.
