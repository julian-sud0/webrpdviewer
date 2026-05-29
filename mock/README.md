# Offline mock backend

Runs the SmartRPD viewer with **zero real network access**, against synthetic
case data. Useful for UI / UX / performance / de-minification work without
credentials or a reachable backend (`live.api.smartrpdai.com` is unreachable
from CI / most dev environments).

## Run it

```bash
npm run dev:mock     # regenerates fixtures, serves, opens index.dev.html
# or manually:
npm run fixtures     # node mock/generate-fixtures.mjs
npm run serve        # then open http://localhost:8080/index.dev.html
```

`index.dev.html` is a copy of `index.html` that loads `mock/fetch-mock.js`
(a classic script, so it patches `window.fetch` before the viewer's module
scripts) and bakes a `?id` token for `case_int_id 12345`. **Production
`index.html` is untouched.**

## Pieces

| File | Role |
|---|---|
| `fetch-mock.js` | Patches `window.fetch`; routes every `live.api.smartrpdai.com` call to a fixture, passes all other requests through. Logs to `window.__MOCK_LOG__`; warns on any unmatched API call. |
| `generate-fixtures.mjs` | Builds the synthetic case: half-torus "dental arch" meshes (OFF + binary STL), undercut/occlusion heatmaps, thumbnail, notes. Pure Node, no deps. Self-tests on run. |
| `fixtures/` | Generated JSON the shim serves. Regenerate with `npm run fixtures`. |
| `verify.mjs` | Parses every fixture through the viewer's **exact** logic (OFF/STL parse, heatmap unpack) and asserts mesh/heatmap consistency. `node mock/verify.mjs`. |

See [`../CONTRACT.md`](../CONTRACT.md) for the full data contract these
fixtures implement.

## Verifying

```bash
node mock/verify.mjs   # headless: asserts fixtures parse + sizes line up
```

The viewer itself needs WebGL, so a full visual render can only be confirmed in
a real browser (open `index.dev.html`). On load you should see, with no network
errors: a colored dental arch, working Undercut / Occlusion / model toggles,
the 2D thumbnail, and two seeded chat notes. The console shows `[mock]` lines
for every intercepted call and **no** `PASSTHROUGH`/`UNMATCHED` warnings for API
paths.

## Limitations / TODO

- `stl/raw/get` (raw occlusal jaw) is stubbed to `[]`.
- Meshes are generic arches, not real anatomy, and do not carry distinct RPD
  components (clasps, connectors, etc.) as separate objects.
- Heatmap colors are synthetic gradients, not real survey/occlusion analysis.
