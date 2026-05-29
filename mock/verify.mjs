#!/usr/bin/env node
/**
 * verify.mjs — validate the generated fixtures against the viewer's EXACT
 * parsing logic (reverse-engineered from bundle.js), without a browser.
 *
 * This is the closest we can get to a render test in a headless sandbox: it
 * decodes every fixture the way bundle.js does and asserts the meshes build
 * valid geometry and the heatmaps line up vertex-for-vertex with the meshes
 * they are paired with. Run after generate-fixtures.mjs.
 *
 *   node mock/verify.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const read = (n) => JSON.parse(readFileSync(join(FIX, n)));
const b64ToBuf = (s) => Buffer.from(s, "base64");

let failures = 0;
const ok = (msg) => console.log("  ✓ " + msg);
function assert(cond, msg) {
  if (cond) ok(msg);
  else { console.error("  ✗ " + msg); failures++; }
}

// --- viewer-exact OFF parser (mirrors bundle.js Eo.parse vertex/face logic) ---
function parseOFF(text) {
  const a = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (a[0].trim() !== "OFF") throw new Error("not OFF");
  const [s, o] = a[1].trim().split(" ").map(Number);
  let vlen = 0;
  for (let t = 0; t < s; t++) vlen += a[2 + t].trim().split(" ").map(Number).length;
  const idx = [];
  const d = 2 + s;
  for (let t = 0; t < o; t++) {
    const e = a[d + t].trim().split(" ").map(Number);
    if (e[0] === 3) idx.push(e[2], e[3], e[4]); // viewer reads tokens 2,3,4
  }
  return { vCount: vlen / 3, idx };
}

// --- viewer-exact binary STL triangle count (bundle.js reads uint32 @ 80) ---
function stlVertexCount(buf) {
  const tris = buf.readUInt32LE(80);
  if (buf.length !== 84 + tris * 50) throw new Error(`STL size mismatch: ${buf.length} != ${84 + tris * 50}`);
  return tris * 3;
}

// --- viewer-exact heatmap unpack: bytes -> Float32Array, 4 floats/vertex ------
function heatmapVertexCount(byteArr) {
  const floats = new Float32Array(new Uint8Array(byteArr).buffer);
  return floats.length / 4;
}
function heatmapHasNoOnes(byteArr) {
  const f = new Float32Array(new Uint8Array(byteArr).buffer);
  for (let i = 0; i < f.length; i++) if (f[i] === 1) return false;
  return true;
}

console.log("OFF jaw meshes (parameterisation) + matching heatmap (/undercutheatmap/get):");
{
  const param = read("parameterisation.json");
  const surface = read("surface.json");
  const hUp = read("heatmap_upper.json");
  const hLo = read("heatmap_lower.json");

  for (const item of [...param, ...surface]) {
    const text = b64ToBuf(item.data).toString("utf8");
    const { vCount, idx } = parseOFF(text);
    const maxIdx = idx.length ? Math.max(...idx) : -1;
    assert(idx.every(Number.isInteger), `${item.filename}: all face indices are integers (no undefined)`);
    assert(maxIdx < vCount && maxIdx >= 0, `${item.filename}: indices in range (max ${maxIdx} < ${vCount} verts)`);
  }

  // The indexed OFF jaw vertex count must equal the /undercutheatmap data length.
  const jawUp = parseOFF(b64ToBuf(param.find((p) => p.type === "upper").data).toString("utf8"));
  const jawLo = parseOFF(b64ToBuf(param.find((p) => p.type === "lower").data).toString("utf8"));
  assert(heatmapVertexCount(hUp.surveying_values.data) === jawUp.vCount, `upper undercut heatmap sized to upper jaw (${jawUp.vCount} verts)`);
  assert(heatmapVertexCount(hUp.occlusion_values.data) === jawUp.vCount, `upper occlusion heatmap sized to upper jaw (${jawUp.vCount} verts)`);
  assert(heatmapVertexCount(hLo.surveying_values.data) === jawLo.vCount, `lower undercut heatmap sized to lower jaw (${jawLo.vCount} verts)`);
  assert(heatmapHasNoOnes(hUp.surveying_values.data) && heatmapHasNoOnes(hUp.occlusion_values.data), "upper heatmap has no exact-1.0 components (won't fall back to tan)");
}

console.log("STL slots + matching heatmap (/additionalundercutheatmap/get):");
{
  const aUp = read("additional_heatmap_upper.json");
  const aLo = read("additional_heatmap_lower.json");
  const slots = { 1: aUp, 3: aLo }; // jaws get heatmap; designs (2,4) get null
  for (let n = 1; n <= 4; n++) {
    const slot = read(`slot_${n}.json`);
    assert(typeof slot.data === "string" && slot.data.length > 0, `slot_${n}: has base64 STL data`);
    const buf = b64ToBuf(slot.data);
    const vc = stlVertexCount(buf);
    ok(`slot_${n}: valid binary STL (${vc / 3} tris, ${vc} verts)`);
    if (slots[n]) {
      assert(heatmapVertexCount(slots[n].surveying_values.data) === vc, `slot_${n} jaw heatmap sized to slot mesh (${vc} verts)`);
    }
  }
}

console.log("Thumbnail + notes + case:");
{
  const thumbs = read("thumbnails.json");
  const slot0 = thumbs.find((t) => t.slot === 0);
  assert(!!slot0, "thumbnails has an element with slot === 0 (viewer reads this)");
  const png = b64ToBuf(slot0.data);
  assert(png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47, "thumbnail decodes to a valid PNG signature");

  const notes = read("notes.json");
  assert(Array.isArray(notes) && notes.length > 0, "notes is a non-empty array");
  assert(notes.every((n) => "author_username" in n && "content" in n && "created_at" in n), "notes have author_username/content/created_at");

  const c = read("case.json");
  assert(c.case_id && c.username && c.last_updated && c.creation_date, "case has case_id/username/last_updated/creation_date");
}

console.log("");
if (failures) { console.error(`VERIFY FAILED: ${failures} assertion(s) failed.`); process.exit(1); }
console.log("VERIFY OK — all fixtures parse cleanly through the viewer's exact logic.");
