#!/usr/bin/env node
/**
 * generate-fixtures.mjs — synthesize a complete offline case for the SmartRPD
 * viewer so it renders with zero real network access.
 *
 * Everything here is reverse-engineered from bundle.js. The formats are chosen
 * to satisfy the *actual* (and occasionally quirky) parsers in the shipped
 * viewer, not generic spec compliance. Key facts encoded below:
 *
 *  - OFF mesh `.data`     : base64 of OFF text. Decoded via atob (`Co`).
 *  - OFF vertex lines     : "x y z"            (exactly 3 numbers).
 *  - OFF face lines       : "3 _ i j k"        the parser reads indices from
 *                           token positions 2,3,4 — token[1] is SKIPPED.
 *  - OFF counts line      : "V F 0"            only V and F are read.
 *  - isClosed (3rd arg)   : true when filename contains "ParameterisationMesh"
 *                           or "closed" — gates building the heatmap geometries.
 *  - STL slot `.data`     : base64 of binary STL (triangle soup).
 *  - heatmap `.data`      : a plain JSON array of BYTES; the viewer does
 *                           `new Float32Array(new Uint8Array(data).buffer)` and
 *                           reads 4 float32 per vertex (R,G,B,unused), 0..1.
 *                           A component === 1.0 exactly is replaced by the tan
 *                           default, so we keep values strictly below 1.
 *  - /undercutheatmap/get        sizes to the INDEXED OFF vertex count.
 *  - /additionalundercutheatmap/get sizes to the STL SOUP vertex count (tris*3).
 *
 * Output: ./mock/fixtures/*  (consumed by mock/fetch-mock.js)
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, "fixtures");
const REPO = join(__dirname, "..");
mkdirSync(FIX, { recursive: true });

const CASE_INT_ID = 12345; // matches the baked ?id token in index.dev.html

// ---------------------------------------------------------------------------
// Geometry: a half-torus "dental arch" lying in the XZ plane.
// ---------------------------------------------------------------------------
function archVertex(u, v, R, r) {
  const cu = Math.cos(u), su = Math.sin(u);
  const cv = Math.cos(v), sv = Math.sin(v);
  return [
    (R + r * cv) * cu, // x
    r * sv,            // y (up)
    (R + r * cv) * su, // z
  ];
}

/** Indexed grid arch -> { positions:[x,y,z...], indices:[i,j,k...], count }. */
function buildIndexedArch({ U, V, R, r, yOffset = 0, scale = 1 }) {
  const positions = [];
  for (let i = 0; i <= U; i++) {
    const u = (Math.PI * i) / U; // half circle => arch
    for (let j = 0; j <= V; j++) {
      const v = (2 * Math.PI * j) / V;
      const [x, y, z] = archVertex(u, v, R, r);
      positions.push(x * scale, y * scale + yOffset, z * scale);
    }
  }
  const indices = [];
  const stride = V + 1;
  for (let i = 0; i < U; i++) {
    for (let j = 0; j < V; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, b, d, b, c, d);
    }
  }
  return { positions, indices, count: positions.length / 3 };
}

/** Triangle-soup arch (for binary STL) -> { tris:[ [v0,v1,v2], ... ] }. */
function buildSoupArch({ U, V, R, r, yOffset = 0, scale = 1 }) {
  const vtx = (i, j) => {
    const u = (Math.PI * i) / U;
    const v = (2 * Math.PI * j) / V;
    const [x, y, z] = archVertex(u, v, R, r);
    return [x * scale, y * scale + yOffset, z * scale];
  };
  const tris = [];
  for (let i = 0; i < U; i++) {
    for (let j = 0; j < V; j++) {
      const a = vtx(i, j), b = vtx(i + 1, j), c = vtx(i + 1, j + 1), d = vtx(i, j + 1);
      tris.push([a, b, d], [b, c, d]);
    }
  }
  return { tris, count: tris.length * 3 };
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------
function toOFF({ positions, indices }) {
  const vCount = positions.length / 3;
  const fCount = indices.length / 3;
  const lines = ["OFF", `${vCount} ${fCount} 0`];
  for (let i = 0; i < vCount; i++) {
    lines.push(`${positions[3 * i].toFixed(5)} ${positions[3 * i + 1].toFixed(5)} ${positions[3 * i + 2].toFixed(5)}`);
  }
  for (let f = 0; f < fCount; f++) {
    const a = indices[3 * f], b = indices[3 * f + 1], c = indices[3 * f + 2];
    // Token[1] (the "0") is intentionally ignored by the viewer's parser, which
    // reads vertex indices from token positions 2,3,4.
    lines.push(`3 0 ${a} ${b} ${c}`);
  }
  return lines.join("\n") + "\n";
}

function toBinarySTL({ tris }) {
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.write("SmartRPD mock STL".padEnd(80, " "), 0, 80, "ascii");
  buf.writeUInt32LE(tris.length, 80);
  let off = 84;
  for (const [a, b, c] of tris) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    buf.writeFloatLE(nx, off); buf.writeFloatLE(ny, off + 4); buf.writeFloatLE(nz, off + 8);
    let p = off + 12;
    for (const vtx of [a, b, c]) {
      buf.writeFloatLE(vtx[0], p); buf.writeFloatLE(vtx[1], p + 4); buf.writeFloatLE(vtx[2], p + 8);
      p += 12;
    }
    buf.writeUInt16LE(0, off + 48); // attribute byte count
    off += 50;
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Heatmap data: 4 float32 (R,G,B,0) per vertex, packed little-endian, then
// emitted as a plain array of byte values (what the viewer's JSON path yields).
// ---------------------------------------------------------------------------
const clamp = (x) => Math.max(0, Math.min(0.95, x));
function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function ramp(stops, t) {
  t = Math.max(0, Math.min(1, t));
  const seg = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(seg));
  return lerp3(stops[i], stops[i + 1], seg - i);
}
const OCCLUSION_RAMP = [[0.10, 0.80, 0.20], [0.95, 0.90, 0.10], [0.90, 0.10, 0.10]]; // green->yellow->red
const UNDERCUT_RAMP = [[0.10, 0.30, 0.90], [0.10, 0.85, 0.85], [0.90, 0.20, 0.20]]; // blue->cyan->red

/** colorFn(idx, x, y, z) -> [r,g,b] in 0..1. Returns a JSON byte array. */
function packHeatmap(count, positions, colorFn) {
  const f = new Float32Array(count * 4);
  for (let s = 0; s < count; s++) {
    const x = positions ? positions[3 * s] : 0;
    const y = positions ? positions[3 * s + 1] : 0;
    const z = positions ? positions[3 * s + 2] : 0;
    const [r, g, b] = colorFn(s, x, y, z);
    f[4 * s] = clamp(r); f[4 * s + 1] = clamp(g); f[4 * s + 2] = clamp(b); f[4 * s + 3] = 0;
  }
  return Array.from(new Uint8Array(f.buffer));
}

// Color fields driven by position so the heatmaps are visually meaningful.
const occlusionColor = (R) => (idx, x, y, z) => {
  const u = (Math.atan2(z, x) + Math.PI) % Math.PI; // 0..PI along the arch
  return ramp(OCCLUSION_RAMP, u / Math.PI);
};
const undercutColor = (r) => (idx, x, y, z) => ramp(UNDERCUT_RAMP, (y / r + 1) / 2);

// ---------------------------------------------------------------------------
// Build the meshes
// ---------------------------------------------------------------------------
const R = 10, rJaw = 2.6, rDent = 1.7;

// OFF (indexed) — jaw (parameterisation) + denture (surface), upper & lower.
const offUpperJaw = buildIndexedArch({ U: 48, V: 12, R, r: rJaw });
const offLowerJaw = buildIndexedArch({ U: 48, V: 12, R, r: rJaw, yOffset: -7 });
const offUpperDent = buildIndexedArch({ U: 48, V: 12, R, r: rDent, yOffset: 0.6 });
const offLowerDent = buildIndexedArch({ U: 48, V: 12, R, r: rDent, yOffset: -6.4 });

// STL (soup) — slots 1..4. Coarser is fine; sized independently.
const stlUpperJaw = buildSoupArch({ U: 24, V: 8, R, r: rJaw });
const stlUpperDesign = buildSoupArch({ U: 24, V: 8, R, r: rDent, yOffset: 0.6 });
const stlLowerJaw = buildSoupArch({ U: 24, V: 8, R, r: rJaw, yOffset: -7 });
const stlLowerDesign = buildSoupArch({ U: 24, V: 8, R, r: rDent, yOffset: -6.4 });

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const b64bin = (buf) => buf.toString("base64");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const now = Math.floor(Date.now() / 1000);
const write = (name, obj) => writeFileSync(join(FIX, name), JSON.stringify(obj));

write("case.json", {
  case_id: "DEMO-2026-12345",
  case_int_id: CASE_INT_ID,
  last_updated: now - 3600,
  creation_date: now - 86400 * 3,
  username: "demo_designer",
});

// /undercutheatmap/get  -> sized to the INDEXED OFF meshes.
function offHeatmap(jawTypeStr, mesh, r) {
  return {
    jaw_type: jawTypeStr,
    surveying_values: { data: packHeatmap(mesh.count, mesh.positions, undercutColor(r)) },
    occlusion_values: { data: packHeatmap(mesh.count, mesh.positions, occlusionColor(R)) },
  };
}
write("heatmap_upper.json", offHeatmap("upper_jaw", offUpperJaw, rJaw));
write("heatmap_lower.json", offHeatmap("lower_jaw", offLowerJaw, rJaw));

// /additionalundercutheatmap/get -> sized to the STL SOUP slot meshes.
function soupHeatmap(jawTypeStr, soup, r) {
  // Flatten soup vertex positions in the exact order STL emits them.
  const pos = [];
  for (const tri of soup.tris) for (const v of tri) pos.push(v[0], v[1], v[2]);
  return {
    jaw_type: jawTypeStr,
    surveying_values: { data: packHeatmap(soup.count, pos, undercutColor(r)) },
    occlusion_values: { data: packHeatmap(soup.count, pos, occlusionColor(R)) },
  };
}
write("additional_heatmap_upper.json", soupHeatmap("upper_jaw", stlUpperJaw, rJaw));
write("additional_heatmap_lower.json", soupHeatmap("lower_jaw", stlLowerJaw, rJaw));

// /parameterisation/mesh/getall  (the jaws, closed -> heatmap geometries built)
write("parameterisation.json", [
  { filename: "ParameterisationMesh_upper.off", data: b64(toOFF(offUpperJaw)), type: "upper" },
  { filename: "ParameterisationMesh_lower.off", data: b64(toOFF(offLowerJaw)), type: "lower" },
]);

// /surface/getall  (the dentures)
write("surface.json", [
  { filename: "surface_upper.off", data: b64(toOFF(offUpperDent)), type: "upper" },
  { filename: "surface_lower.off", data: b64(toOFF(offLowerDent)), type: "lower" },
]);

// /stl/raw/get — raw jaw occlusal view. Stubbed empty for the foundation.
write("raw.json", []);

// /stl/slot/get — keyed by slotNumber (1..4).
write("slot_1.json", { data: b64bin(toBinarySTL(stlUpperJaw)) });
write("slot_2.json", { data: b64bin(toBinarySTL(stlUpperDesign)) });
write("slot_3.json", { data: b64bin(toBinarySTL(stlLowerJaw)) });
write("slot_4.json", { data: b64bin(toBinarySTL(stlLowerDesign)) });

// /thumbnails/get — viewer uses the element whose slot === 0.
const thumbSrc = ["Icon_UpperJaw.png", "Occlusion.png"].find((f) => existsSync(join(REPO, f)));
const thumbB64 = thumbSrc ? readFileSync(join(REPO, thumbSrc)).toString("base64") : "";
write("thumbnails.json", [{ slot: 0, data: thumbB64 }]);

// /notes/get/{id}
write("notes.json", [
  { author_username: "demo_designer", content: "Initial RPD design uploaded for review.", image_base64: null, created_at: new Date((now - 7200) * 1000).toISOString() },
  { author_username: "supervisor", content: "Please verify the major connector clearance on the lower arch.", image_base64: null, created_at: new Date((now - 3600) * 1000).toISOString() },
]);

// ---------------------------------------------------------------------------
// Self-test: replicate the viewer's exact OFF parse + heatmap unpack and assert
// the fixtures are internally consistent (catches off-by-one / sizing bugs).
// ---------------------------------------------------------------------------
function parseOFFLikeViewer(text) {
  const a = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (a[0].trim() !== "OFF") throw new Error("not OFF");
  const [s, o] = a[1].trim().split(" ").map(Number);
  const verts = [];
  for (let t = 0; t < s; t++) { const e = a[2 + t].trim().split(" ").map(Number); verts.push(...e); }
  const idx = [];
  const d = 2 + s;
  for (let t = 0; t < o; t++) {
    const e = a[d + t].trim().split(" ").map(Number);
    if (e[0] === 3) idx.push(e[2], e[3], e[4]); // <- the viewer's exact indexing
  }
  return { vCount: verts.length / 3, idx };
}

function selfTest() {
  for (const mesh of [offUpperJaw, offLowerJaw, offUpperDent, offLowerDent]) {
    const text = toOFF(mesh);
    const { vCount, idx } = parseOFFLikeViewer(text);
    if (vCount !== mesh.count) throw new Error(`OFF vertex count mismatch: ${vCount} != ${mesh.count}`);
    if (idx.length !== mesh.indices.length) throw new Error(`OFF index count mismatch: ${idx.length} != ${mesh.indices.length}`);
    const maxIdx = Math.max(...idx);
    if (maxIdx >= vCount) throw new Error(`OFF index out of range: ${maxIdx} >= ${vCount}`);
    if (idx.some((v) => !Number.isInteger(v))) throw new Error("OFF produced non-integer/undefined index");
    for (let i = 0; i < idx.length; i++) if (idx[i] !== mesh.indices[i]) throw new Error(`OFF index ${i} differs: ${idx[i]} != ${mesh.indices[i]}`);
  }
  // Heatmap byte arrays must reinterpret to exactly count*4 float32.
  const checks = [
    [JSON.parse(readFileSync(join(FIX, "heatmap_upper.json"))), offUpperJaw.count],
    [JSON.parse(readFileSync(join(FIX, "additional_heatmap_upper.json"))), stlUpperJaw.count],
  ];
  for (const [hm, count] of checks) {
    for (const field of ["surveying_values", "occlusion_values"]) {
      const bytes = hm[field].data;
      if (bytes.length !== count * 16) throw new Error(`${field} byte length ${bytes.length} != ${count * 16}`);
      const floats = new Float32Array(new Uint8Array(bytes).buffer);
      if (floats.length !== count * 4) throw new Error(`${field} float length ${floats.length} != ${count * 4}`);
      for (let i = 0; i < floats.length; i++) if (floats[i] === 1) throw new Error(`${field} has a 1.0 component (would become tan default) at ${i}`);
    }
  }
  console.log("self-test: OK");
}

selfTest();
console.log(`Fixtures written to ${FIX}`);
console.log(`  OFF jaw verts=${offUpperJaw.count}  STL slot verts=${stlUpperJaw.count}`);
console.log(`  case_int_id=${CASE_INT_ID}  thumbnail=${thumbSrc || "(none)"}`);
