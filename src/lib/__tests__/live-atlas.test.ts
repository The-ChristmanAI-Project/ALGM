/**
 * The live atlas, tested against the real providers.
 *
 * Every test here talks to the real thing or reports itself as not run. There
 * are no recorded replies and no stand-ins: a provider we cannot reach, or have
 * no key for, is skipped with the reason, never passed.
 *
 * Keys for the keyed checks come from the environment of whoever runs the
 * suite (ALGM_TEST_ANTHROPIC_KEY, ALGM_TEST_OPENAI_KEY, ...). They are never
 * written anywhere.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.ALGM_DATA_DIR = mkdtempSync(join(tmpdir(), "algm-live-test-"));

const { checkProvider } = await import("../live/fetch.server.ts");
const { setKey, clearKey, keySummary } = await import("../live/keys.server.ts");
const { liveAtlas, PROVIDERS } = await import("../live/providers.ts");

const KEYED = ["anthropic", "openai", "google", "xai", "mistral", "deepseek"] as const;

test("NVIDIA's public list answers, and its fake 1993 dates are not shown as release dates", async (t) => {
  const r = await checkProvider("nvidia");
  if (r.state === "unreachable") return t.skip(`not run: NVIDIA unreachable from here (${r.detail})`);
  assert.equal(r.state, "ok", JSON.stringify(r).slice(0, 300));
  if (r.state !== "ok") return;
  assert.ok(r.models.length > 0, "NVIDIA listed no models");
  assert.ok(r.models.every((m) => m.provider === "nvidia" && m.id.includes("/")));
  assert.ok(r.models.every((m) => m.released === undefined), "a 1993 'created' stamp was presented as a release date");
});

for (const p of KEYED) {
  test(`${p}: with no key it is not asked, and says so`, async () => {
    clearKey(p);
    const r = await checkProvider(p);
    assert.equal(r.state, "no_key");
  });

  test(`${p}: a wrong key is presented and refused by the real API, and the refusal is reported`, async (t) => {
    setKey(p, "algm-deliberately-invalid-key-0000");
    const r = await checkProvider(p);
    clearKey(p);
    if (r.state === "unreachable") return t.skip(`not run: ${p} unreachable from here (${r.detail})`);
    assert.equal(r.state, "refused", JSON.stringify(r).slice(0, 300));
    if (r.state === "refused") {
      assert.ok([400, 401, 403].includes(r.status), `unexpected status ${r.status}: ${r.detail}`);
      t.diagnostic(`${p} answered ${r.status}: ${r.detail.slice(0, 120)}`);
    }
  });

  test(`${p}: with a real key, the real list comes back`, async (t) => {
    const key = process.env[`ALGM_TEST_${p.toUpperCase()}_KEY`];
    if (!key) return t.skip(`not run: no ALGM_TEST_${p.toUpperCase()}_KEY in this environment`);
    setKey(p, key);
    const r = await checkProvider(p);
    clearKey(p);
    assert.equal(r.state, "ok", JSON.stringify(r).slice(0, 300));
    if (r.state === "ok") assert.ok(r.models.length > 0);
  });
}

test("Anthropic: the key goes in x-api-key (the API says the key was invalid, not missing)", async (t) => {
  setKey("anthropic", "algm-deliberately-invalid-key-0000");
  const r = await checkProvider("anthropic");
  clearKey("anthropic");
  if (r.state === "unreachable") return t.skip(`not run: ${r.detail}`);
  assert.equal(r.state, "refused");
  if (r.state === "refused") assert.match(r.detail, /invalid x-api-key/i);
});

test("keys never leave as themselves: the page sees only the last four characters", () => {
  setKey("openai", "sk-this-is-not-real-abcd");
  const s = keySummary();
  clearKey("openai");
  assert.deepEqual(s.openai, { set: true, last4: "abcd" });
  assert.ok(!JSON.stringify(s).includes("not-real"));
});

test("Bedrock: the real ListFoundationModels, on this machine's AWS identity", async (t) => {
  const r = await checkProvider("bedrock");
  if (r.state === "no_key") return t.skip(`not run: ${r.detail}`);
  if (r.state === "unreachable") return t.skip(`not run: ${r.detail}`);
  // AWS rejecting the identity itself means this machine cannot ask Bedrock at
  // all. That is a check that could not run, not a pass and not a Bedrock result.
  if (r.state === "refused" && /UnrecognizedClient|InvalidClientTokenId|ExpiredToken|SignatureDoesNotMatch/.test(r.detail)) {
    return t.skip(`not run: AWS refused this machine's identity (${r.detail.slice(0, 80)})`);
  }
  assert.equal(r.state, "ok", JSON.stringify(r).slice(0, 300));
  if (r.state === "ok") {
    assert.ok(r.models.length > 0);
    assert.ok(r.models.some((m) => m.inputModalities?.length), "Bedrock reports modalities; none were parsed");
  }
});

test("Ollama: the models pulled onto this machine", async (t) => {
  const r = await checkProvider("ollama");
  if (r.state === "unreachable") return t.skip(`not run: no Ollama answering on this machine (${r.detail})`);
  assert.equal(r.state, "ok", JSON.stringify(r).slice(0, 300));
  if (r.state !== "ok") return;
  // A ":cloud" model is listed here but answers from Ollama's servers. It must
  // never be presented as on this device.
  for (const m of r.models) {
    assert.equal(m.runsAt, /[:-]cloud$/i.test(m.id) ? "provider cloud" : "this device", m.id);
  }
  t.diagnostic(`${r.models.length} models: ${r.models.map((m) => `${m.id} (${m.runsAt})`).join(", ")}`);
});

test("the book is judged only against providers that answered", async (t) => {
  const nv = await checkProvider("nvidia");
  if (nv.state !== "ok") return t.skip("not run: NVIDIA did not answer");
  const atlas = liveAtlas([nv]);
  // Claude is not on NVIDIA's catalog and Anthropic was not asked: that is
  // unconfirmed, never "gone".
  assert.equal(atlas.book["claude-opus-4"].state, "unconfirmed");
  // A reseller not carrying a model is not the maker retiring it: NVIDIA's list
  // alone can never call DeepSeek V3 or Llama gone.
  assert.notEqual(atlas.book["deepseek-v3"].state, "gone");
  assert.notEqual(atlas.book["llama-70b-local"].state, "gone");
  // Every NVIDIA model the book does not own is listed as unverified, none dropped.
  const owned = Object.values(atlas.book).flatMap((b) => ("where" in b ? b.where : [])).filter((w) => w.provider === "nvidia").length;
  assert.equal(atlas.unverified.length + owned, nv.models.length);
  assert.equal(PROVIDERS.length, 9);
});
