# SmartRPD Lite Web — Development Setup

Browser-based 3D dental viewer (Removable Partial Denture) built on
**three.js 0.165** + **dat.gui**, bundled with **Webpack**. Pure static
front-end that talks to a hosted backend.

## Architecture

```
index.html ──┬─ src/chat.js     comment / chat widget        (editable source ✅)
             ├─ src/mobile.js   mobile / touch UI             (editable source ✅)
             ├─ src/crypt.js    XOR+base64 case-ID decode     (editable source ✅)
             ├─ css/style.css   styling                       (editable source ✅)
             └─ bundle.js       THE ENTIRE 3D VIEWER, MINIFIED (no source ⚠️)
```

Runtime dependencies:
- **Backend API**: `https://live.api.smartrpdai.com/api/smartrpd` (login, case data, mailing list)
- **Case selection** via `?id=<encrypted>` URL param (decoded by `src/crypt.js`)
- Loads 3D meshes in `.obj` / `.off` / `.stl`

## Running locally

```bash
npm install        # one-time
npm run serve      # static server at http://localhost:8080
```

This serves the existing pre-built `bundle.js` and the editable `src/` + `css/`.
Good enough to iterate on the chat widget, mobile UX, and styling immediately.

To load a real case you need `?id=<token>` and a reachable backend, e.g.
`http://localhost:8080/?id=...`.

## Building (currently blocked)

```bash
npm run build      # webpack --mode production  → dist/bundle.js
npm run dev        # webpack --watch (development)
```

> ⚠️ **The Webpack entry `src/index.js` is NOT in this repo.** Only the
> compiled `bundle.js` was ever committed (the entry was gitignored on the
> author's machine). `npm run build` fails with
> `Module not found: ./src/index.js` until the viewer source is restored.
> Build output goes to `dist/` so it can never clobber the working root
> `bundle.js`; copy `dist/bundle.js` → `./bundle.js` only after verifying.

## Known blockers for refinement work

1. **Viewer source missing.** Product/UI and performance work on the 3D viewer
   itself (camera, rendering, undercut/occlusion/survey-line analysis) lives
   only in minified `bundle.js`. The upstream scaffold this was forked from is
   public — [gjmolter/web-3dmodel-threejs](https://github.com/gjmolter/web-3dmodel-threejs)
   — but it is a minimal tutorial repo and does **not** contain the
   dental-specific logic. That custom code is not published anywhere we could
   find (web search + GitHub code/repo search). Options: restore the original
   `src/` from the author, or de-minify `bundle.js`.
2. **Backend unreachable from sandbox.** `live.api.smartrpdai.com` returns 403
   and `smartrpdai.com` is unreachable from this environment's network policy,
   so real-case data won't load here even with credentials. Use mocked API
   responses + a local sample mesh for offline UI/perf work, or run from an
   environment with both credentials and a permissive network policy.
