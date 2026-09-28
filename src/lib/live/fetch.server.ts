/**
 * Ask each provider which models exist, right now.
 *
 * Every call has a timeout. Every failure is reported as what happened —
 * no key, the provider refused and what it said, or it could not be reached —
 * and never as an empty list, because an empty list would read as "this
 * provider has no models", which is a claim nobody made.
 */

import { BedrockClient, ListFoundationModelsCommand } from "@aws-sdk/client-bedrock";
import { getKey } from "./keys.server.ts";
import { PROVIDERS, parseProvider, type ProviderId, type ProviderResult } from "./providers.ts";

const TIMEOUT_MS = 15_000;
const now = () => new Date().toISOString();

type Req = { url: string; headers: Record<string, string> };

/** How each keyed provider wants its key presented. */
function request(p: ProviderId, key: string | undefined, page?: string): Req | undefined {
  switch (p) {
    case "anthropic":
      return key ? {
        url: `https://api.anthropic.com/v1/models?limit=1000${page ? `&after_id=${encodeURIComponent(page)}` : ""}`,
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      } : undefined;
    case "openai":
      return key ? { url: "https://api.openai.com/v1/models", headers: { authorization: `Bearer ${key}` } } : undefined;
    case "google":
      return key ? {
        url: `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`,
        headers: { "x-goog-api-key": key },
      } : undefined;
    case "xai":
      return key ? { url: "https://api.x.ai/v1/models", headers: { authorization: `Bearer ${key}` } } : undefined;
    case "mistral":
      return key ? { url: "https://api.mistral.ai/v1/models", headers: { authorization: `Bearer ${key}` } } : undefined;
    case "deepseek":
      return key ? { url: "https://api.deepseek.com/models", headers: { authorization: `Bearer ${key}` } } : undefined;
    case "nvidia":
      return { url: "https://integrate.api.nvidia.com/v1/models", headers: key ? { authorization: `Bearer ${key}` } : {} };
    case "ollama":
      return { url: `${process.env.OLLAMA_HOST?.replace(/\/$/, "") || "http://127.0.0.1:11434"}/api/tags`, headers: {} };
    default:
      return undefined;
  }
}

/** The cursor for the next page, when the provider paginates and says there is more. */
function nextPage(p: ProviderId, body: any): string | undefined {
  if (p === "anthropic" && body?.has_more && typeof body?.last_id === "string") return body.last_id;
  if (p === "google" && typeof body?.nextPageToken === "string" && body.nextPageToken) return body.nextPageToken;
  return undefined;
}

async function getJson(req: Req): Promise<{ ok: true; body: any } | { ok: false; status: number; detail: string } | { ok: false; status: 0; detail: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(req.url, { headers: { accept: "application/json", ...req.headers }, signal: ctl.signal });
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, detail: text.slice(0, 300).replace(/\s+/g, " ").trim() };
    try {
      return { ok: true, body: JSON.parse(text) };
    } catch {
      return { ok: false, status: res.status, detail: `answered ${res.status} but the body was not JSON` };
    }
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "AbortError" ? `no answer within ${TIMEOUT_MS / 1000} seconds` : e.message) : String(e);
    return { ok: false, status: 0, detail: msg };
  } finally {
    clearTimeout(t);
  }
}

async function checkHttp(p: ProviderId): Promise<ProviderResult> {
  const key = getKey(p);
  const first = request(p, key);
  if (!first) return { provider: p, state: "no_key", checkedAt: now(), detail: "No key entered for this provider, so it was not asked." };

  const models = [];
  let page: string | undefined;
  for (let i = 0; i < 20; i++) {
    const r = await getJson(request(p, key, page)!);
    if (!r.ok) {
      return r.status === 0
        ? { provider: p, state: "unreachable", checkedAt: now(), detail: r.detail }
        : { provider: p, state: "refused", checkedAt: now(), status: r.status, detail: r.detail };
    }
    models.push(...parseProvider(p, r.body));
    page = nextPage(p, r.body);
    if (!page) break;
  }
  return { provider: p, state: "ok", checkedAt: now(), models };
}

async function checkBedrock(): Promise<ProviderResult> {
  const region = process.env.ALGM_BEDROCK_REGION || "us-east-1";
  try {
    const client = new BedrockClient({ region, requestHandler: { requestTimeout: TIMEOUT_MS } as any });
    const out = await client.send(new ListFoundationModelsCommand({}));
    return { provider: "bedrock", state: "ok", checkedAt: now(), models: parseProvider("bedrock", out) };
  } catch (e: any) {
    const name = String(e?.name ?? "");
    if (name === "CredentialsProviderError" || /credential/i.test(String(e?.message))) {
      return { provider: "bedrock", state: "no_key", checkedAt: now(), detail: "This machine has no AWS identity, so Bedrock was not asked." };
    }
    const status = Number(e?.$metadata?.httpStatusCode ?? 0);
    const detail = `${name}: ${String(e?.message ?? e)}`.slice(0, 300);
    return status
      ? { provider: "bedrock", state: "refused", checkedAt: now(), status, detail }
      : { provider: "bedrock", state: "unreachable", checkedAt: now(), detail };
  }
}

export async function checkProvider(p: ProviderId): Promise<ProviderResult> {
  return p === "bedrock" ? checkBedrock() : checkHttp(p);
}

export async function checkAll(): Promise<ProviderResult[]> {
  return Promise.all(PROVIDERS.map((p) => checkProvider(p.id)));
}
