/*
 * fetch-mock.js — offline backend shim for the SmartRPD viewer.
 *
 * Loaded as a CLASSIC script in index.dev.html BEFORE the viewer's module
 * scripts, so window.fetch is patched before any request is made. Every call to
 * the live API (https://live.api.smartrpdai.com/...) is answered from synthetic
 * fixtures in ./mock/fixtures; all other requests (the viewer's own assets) pass
 * straight through to the real fetch. No credentials required — login is faked.
 *
 * Regenerate fixtures with:  node mock/generate-fixtures.mjs
 */
(function () {
  "use strict";

  var realFetch = window.fetch.bind(window);
  var FIX = "./mock/fixtures/";
  var API = "live.api.smartrpdai.com";

  window.__MOCK_LOG__ = []; // [{url, matched, fixture}] — inspected by verify step
  var cache = {};

  function log(url, matched, fixture) {
    window.__MOCK_LOG__.push({ url: url, matched: matched, fixture: fixture || null });
    var tag = matched ? "%c[mock] " + (fixture || "ok") : "%c[mock] PASSTHROUGH";
    console.log(tag + " %c" + url, "color:" + (matched ? "#0a0" : "#888") + ";font-weight:bold", "color:#888");
  }

  function json(obj) {
    return new Response(JSON.stringify(obj), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fetch + cache a fixture file using the REAL fetch (so we don't recurse).
  function fixture(name) {
    if (cache[name]) return Promise.resolve(cache[name]);
    return realFetch(FIX + name)
      .then(function (r) {
        if (!r.ok) throw new Error("fixture " + name + " -> " + r.status);
        return r.json();
      })
      .then(function (data) {
        cache[name] = data;
        return data;
      });
  }

  function parseBody(init) {
    if (!init || init.body == null) return null;
    try { return JSON.parse(init.body); } catch (e) { return null; }
  }

  // Pull a jaw_type out of a request body (handles object or [creds, body]).
  function jawTypeOf(body) {
    if (body == null) return null;
    if (Array.isArray(body)) {
      for (var i = 0; i < body.length; i++) {
        var j = jawTypeOf(body[i]);
        if (j != null) return j;
      }
      return null;
    }
    return body.jaw_type != null ? body.jaw_type : null;
  }

  function slotNumberOf(body) {
    if (body == null) return null;
    if (Array.isArray(body)) {
      for (var i = 0; i < body.length; i++) {
        var s = slotNumberOf(body[i]);
        if (s != null) return s;
      }
      return null;
    }
    return body.slotNumber != null ? body.slotNumber : null;
  }

  // Route a live-API request to a fixture. Returns a Promise<Response> or null
  // (null => not an API call we mock; caller should pass through).
  function route(url, init) {
    var body = parseBody(init);

    // Auth + write endpoints: just acknowledge.
    if (url.indexOf("/user/login") !== -1) return Promise.resolve((log(url, true, "login(ok)"), json({ status: "ok" })));
    if (url.indexOf("/notes/create") !== -1) return Promise.resolve((log(url, true, "note(ok)"), json({ status: "ok" })));
    if (url.indexOf("/mailinglist/add") !== -1) return Promise.resolve((log(url, true, "mail(ok)"), json({ message: "(mock) email added to mailing list" })));

    // Read endpoints backed by fixture files.
    var map = function (file) { log(url, true, file); return fixture(file).then(json); };

    if (url.indexOf("/case/get/") !== -1) return map("case.json");
    if (url.indexOf("/thumbnails/get") !== -1) return map("thumbnails.json");
    if (url.indexOf("/notes/get/") !== -1) return map("notes.json");
    if (url.indexOf("/parameterisation/mesh/getall") !== -1) return map("parameterisation.json");
    if (url.indexOf("/surface/getall") !== -1) return map("surface.json");
    if (url.indexOf("/stl/raw/get") !== -1) return map("raw.json");

    if (url.indexOf("/additionalundercutheatmap/get") !== -1) {
      var aj = jawTypeOf(body);
      var upper = aj === "upper_jaw" || aj === 2;
      return map(upper ? "additional_heatmap_upper.json" : "additional_heatmap_lower.json");
    }
    if (url.indexOf("/undercutheatmap/get") !== -1) {
      var j = jawTypeOf(body);
      // undercutheatmap: body jaw_type 2 => upper, 1 => lower.
      var isUpper = j === 2 || j === "upper_jaw";
      return map(isUpper ? "heatmap_upper.json" : "heatmap_lower.json");
    }
    if (url.indexOf("/stl/slot/get") !== -1) {
      var n = slotNumberOf(body);
      if (n >= 1 && n <= 4) return map("slot_" + n + ".json");
      log(url, true, "slot(empty)");
      return Promise.resolve(json({}));
    }

    // An API call we didn't anticipate — surface it loudly, don't hit network.
    log(url, false, null);
    console.warn("[mock] UNMATCHED live-API call (returning empty):", url, body);
    return Promise.resolve(json({}));
  }

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || String(input);
    if (url.indexOf(API) !== -1) {
      var routed = route(url, init);
      if (routed) return routed;
    }
    return realFetch(input, init); // viewer's own assets / fixtures
  };

  console.log("%c[mock] offline backend active — all " + API + " calls served from " + FIX, "color:#b00020;font-weight:bold");
})();
