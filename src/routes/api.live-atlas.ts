import { createFileRoute } from "@tanstack/react-router";
import { checkAll, checkProvider } from "@/lib/live/fetch.server";
import { clearKey, keySummary, setKey } from "@/lib/live/keys.server";
import { PROVIDERS, liveAtlas, type ProviderId, type ProviderResult } from "@/lib/live/providers";

/**
 * GET  /api/live-atlas          every provider, checked now (a result is reused for 5 minutes; ?fresh=1 asks again)
 * POST /api/live-atlas          { provider, key } saves a key and checks that provider at once
 *                               { provider, clear: true } removes the key
 */

const REUSE_MS = 5 * 60_000;
let last: { at: number; results: ProviderResult[] } | undefined;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/** Keys may only be written from ALGM's own page, never by another site in the same browser. */
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin fetches from older browsers, curl on this machine
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/live-atlas")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const fresh = new URL(request.url).searchParams.get("fresh") === "1";
        if (fresh || !last || Date.now() - last.at > REUSE_MS) {
          last = { at: Date.now(), results: await checkAll() };
        }
        return json({ providers: PROVIDERS, keys: keySummary(), atlas: liveAtlas(last.results) });
      },
      POST: async ({ request }) => {
        if (!sameOrigin(request)) return json({ error: "Keys can only be set from ALGM's own page." }, 403);
        let body: any;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Send JSON: { provider, key } or { provider, clear: true }." }, 400);
        }
        const p = PROVIDERS.find((x) => x.id === body?.provider);
        if (!p) return json({ error: `Unknown provider "${String(body?.provider)}".` }, 400);
        if (p.auth !== "key" && p.id !== "nvidia") return json({ error: `${p.label} does not take a key here.` }, 400);

        if (body.clear === true) clearKey(p.id as ProviderId);
        else if (typeof body.key === "string" && body.key.trim().length >= 8) setKey(p.id as ProviderId, body.key);
        else return json({ error: "That does not look like a key." }, 400);

        const result = await checkProvider(p.id as ProviderId);
        const results = (last?.results ?? []).filter((r) => r.provider !== p.id).concat(result);
        last = { at: Date.now(), results };
        return json({ providers: PROVIDERS, keys: keySummary(), atlas: liveAtlas(results) });
      },
    },
  },
});
