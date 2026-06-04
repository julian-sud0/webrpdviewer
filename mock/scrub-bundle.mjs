#!/usr/bin/env node
/**
 * scrub-bundle.mjs — strip the hardcoded service credentials out of a COPY of
 * bundle.js before it is published anywhere public (e.g. GitHub Pages).
 *
 * The offline mock fakes /user/login (it always succeeds) and ignores
 * credentials entirely, so the deployed viewer does not need the real machine
 * id / uuid / password. This removes them from the artifact so hosting the mock
 * never publishes secrets. (The repo copy of bundle.js is not modified by this
 * script — it operates on whatever path you pass, intended to be the build
 * artifact copy.)
 *
 *   node mock/scrub-bundle.mjs <path-to-bundle.js>
 *
 * Pattern-based on purpose: the secret values are never written into this repo.
 * Exits non-zero if the expected credential patterns are not found, so a future
 * bundle change can't silently ship secrets.
 */
import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node mock/scrub-bundle.mjs <path-to-bundle.js>");
  process.exit(2);
}

let src = readFileSync(file, "utf8");

const rules = [
  { name: "machine_id", re: /machine_id:"[^"]*"/g, to: 'machine_id:"MOCK_MACHINE_ID"', required: true },
  // Long literal uuid strings only — three.js generates .uuid at runtime and
  // never assigns a long string literal via `uuid:"..."`, so this is safe.
  { name: "uuid", re: /uuid:"[A-Za-z0-9_-]{16,}"/g, to: 'uuid:"MOCK_UUID"', required: true },
  { name: "password", re: /password:"[^"]*"/g, to: 'password:""', required: true },
  { name: "username(faid)", re: /username:"faid"/g, to: 'username:"mock"', required: false },
];

let total = 0;
for (const r of rules) {
  const n = (src.match(r.re) || []).length;
  if (r.required && n === 0) {
    // Idempotent: a bundle already carrying the scrubbed placeholder is fine —
    // only refuse when neither the secret pattern nor its replacement is present
    // (which would mean an unrecognised bundle that could still hold secrets).
    if (src.includes(r.to)) {
      console.log(`  already scrubbed: ${r.name}`);
      continue;
    }
    console.error(`✗ expected credential pattern not found: ${r.name} — refusing to ship a possibly-unscrubbed bundle`);
    process.exit(1);
  }
  src = src.replace(r.re, r.to);
  total += n;
  console.log(`  scrubbed ${n}× ${r.name}`);
}

writeFileSync(file, src);
console.log(`scrubbed ${total} credential literal(s) from ${file}`);
