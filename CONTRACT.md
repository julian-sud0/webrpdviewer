# SmartRPD Web Viewer — Backend Data Contract

Reverse-engineered from `bundle.js` (the minified viewer) to enable an offline
mock. This is the spec the mock in [`mock/`](./mock) implements. **No
credentials or secrets are recorded here** — the mock requires none.

All API paths are relative to the base `https://live.api.smartrpdai.com/api/smartrpd`.
The internal wrapper (`Wo.post`) issues `POST` with `Content-Type: application/json`
and reads the response as JSON via a streaming reader. Every request is a `fetch`
call (no XHR / axios), so patching `window.fetch` intercepts the entire backend.

## Case selection
`?id=<token>` → decoded by `src/crypt.js` (`lol()`): url-safe base64 → XOR
(key `PgrJrkwpeG9pd`) → `slice(6,-6)` (strips `he3dkf`…`isj3fk`) → base64 → int
`case_int_id`. The mock bakes a token for `case_int_id = 12345`.

## Endpoints

| Method/Path | Request body | Response (fields the viewer reads) |
|---|---|---|
| `POST /user/login` | `[{machine_id,uuid}, {…user}]` | only `response.ok` is checked |
| `POST /case/get/{caseIntId}` | `[{…,case_int_id,jaw_type}]` | `case_id`, `last_updated`, `username`, `creation_date` |
| `POST /thumbnails/get` | `[{…}]` | `[{slot, data}]` — viewer uses the element with `slot===0`; `data` = base64 image → `window.thumbnailBase64` |
| `POST /undercutheatmap/get` | `{…,jaw_type}` (`2`=upper, `1`=lower) | `{jaw_type, surveying_values:{data}, occlusion_values:{data}}` — sized to the **indexed OFF** meshes |
| `POST /additionalundercutheatmap/get` | `{…,jaw_type}` (`"upper_jaw"`/`"lower_jaw"`) | same shape — sized to the **STL slot** meshes |
| `POST /parameterisation/mesh/getall` | `[{…}]` | `[{filename, data, type}]` — jaw meshes (OFF, base64) |
| `POST /surface/getall` | `[{…}]` | `[{filename, data, type}]` — denture meshes (OFF, base64) |
| `POST /stl/raw/get` | `[{…}]` | raw jaw STL (stubbed empty `[]` in the mock) |
| `POST /stl/slot/get` | `[{…creds}, {slotNumber}]` | `{data}` — base64 **binary STL** for slot 1–4 |
| `POST /notes/get/{caseIntId}` | `{}` | `[{author_username, content, image_base64, created_at}]` |
| `POST /notes/create` | `{case_int_id, author_username, content, image_base64}` | ack |
| `POST /mailinglist/add` | `{case_int_id, email}` | `{message}` |

Slot map: **1** = Upper Jaw, **2** = Upper Design, **3** = Lower Jaw, **4** =
Lower Design. Jaws (1, 3) receive heatmaps; designs (2, 4) get `null`.

## Mesh formats (what the viewer's parsers actually accept)

Mesh `data` fields are **base64** and decoded with `atob` (`Co`). Format is
detected by `.off` filename suffix or a leading `OFF` header (`Po`).

### OFF (parameterisation + surface)
```
OFF
<vertexCount> <faceCount> 0      # only the first two numbers are read
x y z                            # vertex lines: exactly 3 numbers
...
3 _ i j k                        # face lines: the parser reads indices from
...                              # token positions 2,3,4 — token[1] is SKIPPED
```
> ⚠️ Non-standard quirk: faces are `3 _ i j k`, **not** the standard `3 i j k`.
> The viewer reads `e[2],e[3],e[4]` as the triangle's vertex indices. Standard
> OFF faces render incorrectly. The generator emits `3 0 i j k`.

`filename` containing `ParameterisationMesh` or `closed` sets `isClosed=true`,
which is what triggers building the heatmap color geometries. `filename`
containing `surface` selects the denture material.

### Binary STL (slots)
Standard binary STL: 80-byte header, `uint32` triangle count, then 50 bytes per
triangle (normal 3×f32, 3 vertices × 3×f32, `uint16` attribute). Triangle soup
→ vertex count = `triangles × 3`.

## Heatmap encoding (undercut / occlusion)

The heatmap endpoints carry per-vertex color, **not** the mesh files. For each of
`surveying_values` (undercut) and `occlusion_values` (occlusion):

- `.data` is a **plain JSON array of byte values**. The viewer does
  `new Float32Array(new Uint8Array(data).buffer)` → **4 float32 per vertex**
  (`R, G, B, unused`), each in `0..1`.
- A component **exactly `1.0`** is replaced by the default tan color
  `(208, 190, 141)/255`. Keep heatmap values `< 1.0`.
- `.data` length must equal `vertexCount × 16` bytes for the mesh it pairs with.
  `/undercutheatmap/get` pairs with the indexed OFF meshes; the
  `/additionalundercutheatmap/get` pairs with the STL slot soup meshes (different
  vertex counts — hence two separate heatmap fixtures per jaw).

The viewer builds three geometries `[normal, occlusion, undercut]` and swaps
`mesh.geometry` between them when the Occlusion / Undercut toggles are used. The
presence of each `values` object gates whether its toggle button appears.

## Window globals set by the viewer
`caseID`, `username`, `lastEdited`, `finished`, `thumbnailBase64`,
`loadAllSTLSlots` (loads the 4 STL slots = the finished 3D design).
