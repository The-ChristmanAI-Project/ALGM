/**
 * The live atlas: which models each provider says exist right now.
 *
 * The hand-written atlas (catalog.ts) is a book. This file is the other half:
 * each provider's own model list, read at the moment you ask. Nothing here is
 * seeded. A provider that was not checked says "not checked" and why. A
 * provider that refused says what it answered. A model the provider lists that
 * the book has never characterized is shown as exactly that: it exists, and
 * ALGM has not verified what it can do.
 *
 * This module is pure. It only turns a provider's reply into rows, and rows
 * plus the book into verdicts. The network half lives in fetch.server.ts.
 */

import { MODELS } from "../catalog.ts";

export type ProviderId =
  | "anthropic"
  | "openai"
  | "google"
  | "xai"
  | "mistral"
  | "deepseek"
  | "nvidia"
  | "bedrock"
  | "ollama";

export type Provider = {
  id: ProviderId;
  label: string;
  /** Where the list comes from. Shown next to every row it produced. */
  source: string;
  /** "key": needs a key typed into ALGM. "aws": the machine's AWS identity. "none": public or on this computer. */
  auth: "key" | "aws" | "none";
  /** What the provider's list actually tells you, so nobody reads more into a row than is there. */
  gives: string;
};

export const PROVIDERS: Provider[] = [
  { id: "anthropic", label: "Anthropic", source: "https://api.anthropic.com/v1/models", auth: "key", gives: "Model ids, display names and release dates." },
  { id: "openai", label: "OpenAI", source: "https://api.openai.com/v1/models", auth: "key", gives: "Model ids only. OpenAI's list carries no capabilities." },
  { id: "google", label: "Google Gemini", source: "https://generativelanguage.googleapis.com/v1beta/models", auth: "key", gives: "Model ids, names, input and output token limits, and the methods each supports." },
  { id: "xai", label: "xAI", source: "https://api.x.ai/v1/models", auth: "key", gives: "Model ids only." },
  { id: "mistral", label: "Mistral", source: "https://api.mistral.ai/v1/models", auth: "key", gives: "Model ids, context length, chat / tools / vision / fine-tune flags, and deprecation dates." },
  { id: "deepseek", label: "DeepSeek", source: "https://api.deepseek.com/models", auth: "key", gives: "Model ids only. DeepSeek's ids do not name a version." },
  { id: "nvidia", label: "NVIDIA API catalog", source: "https://integrate.api.nvidia.com/v1/models", auth: "none", gives: "Model ids and owners. Public list; no key needed." },
  { id: "bedrock", label: "Amazon Bedrock", source: "bedrock:ListFoundationModels (us-east-1)", auth: "aws", gives: "Model ids, names, input and output modalities, and lifecycle: active, legacy, end-of-life date." },
  { id: "ollama", label: "Ollama on this computer", source: "http://127.0.0.1:11434/api/tags", auth: "none", gives: "Models pulled onto this machine, with size, family and quantization." },
];

export function provider(id: ProviderId): Provider {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) throw new Error(`unknown provider ${id}`);
  return p;
}

/** One model, as its provider described it. Only fields the provider sent are filled. */
export type LiveModel = {
  provider: ProviderId;
  id: string;
  name?: string;
  /** ISO date the provider gives as release / creation, when it gives a real one. */
  released?: string;
  contextTokens?: number;
  outputTokens?: number;
  inputModalities?: string[];
  outputModalities?: string[];
  /** Flags the provider itself reports. Never inferred. */
  reports?: Partial<Record<"chat" | "tools" | "vision" | "fine_tune" | "streaming", boolean>>;
  /** "active" unless the provider says otherwise. */
  lifecycle?: "active" | "legacy" | "deprecated";
  endOfLife?: string;
  owner?: string;
  /**
   * Where the words go when this model answers, when the list says. An Ollama
   * model tagged ":cloud" is listed on your machine but runs on Ollama's
   * servers — the prompt leaves the device. That is the one thing a local
   * list must never blur.
   */
  runsAt?: "this device" | "provider cloud";
};

export type ProviderResult =
  | { provider: ProviderId; state: "ok"; checkedAt: string; models: LiveModel[] }
  | { provider: ProviderId; state: "no_key"; checkedAt: string; detail: string }
  | { provider: ProviderId; state: "refused"; checkedAt: string; status: number; detail: string }
  | { provider: ProviderId; state: "unreachable"; checkedAt: string; detail: string };

const isoFromUnix = (s: unknown) =>
  typeof s === "number" && s > 1_000_000_000 ? new Date(s * 1000).toISOString() : undefined;
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/** Turn one provider's reply body into rows. Unknown shapes produce no rows, never guesses. */
export function parseProvider(id: ProviderId, body: any): LiveModel[] {
  switch (id) {
    case "anthropic":
      return arr(body?.data).filter((m) => str(m?.id)).map((m) => ({
        provider: id, id: m.id, name: str(m.display_name), released: str(m.created_at),
      }));
    case "openai":
    case "xai":
    case "deepseek":
      return arr(body?.data).filter((m) => str(m?.id)).map((m) => ({
        provider: id, id: m.id, owner: str(m.owned_by), released: isoFromUnix(m.created),
      }));
    case "nvidia":
      // NVIDIA's list carries "created" values that decode to 1993. They are not
      // release dates, so they are not shown as one.
      return arr(body?.data).filter((m) => str(m?.id)).map((m) => ({
        provider: id, id: m.id, owner: str(m.owned_by),
      }));
    case "google":
      return arr(body?.models).filter((m) => str(m?.name)).map((m) => {
        const methods: string[] = arr(m.supportedGenerationMethods);
        return {
          provider: id,
          id: String(m.name).replace(/^models\//, ""),
          name: str(m.displayName),
          contextTokens: num(m.inputTokenLimit),
          outputTokens: num(m.outputTokenLimit),
          reports: { chat: methods.includes("generateContent") },
        };
      });
    case "mistral":
      return arr(body?.data).filter((m) => str(m?.id)).map((m) => {
        const c = m.capabilities ?? {};
        const dep = str(m.deprecation);
        return {
          provider: id,
          id: m.id,
          name: str(m.name),
          owner: str(m.owned_by),
          released: isoFromUnix(m.created),
          contextTokens: num(m.max_context_length),
          reports: {
            chat: typeof c.completion_chat === "boolean" ? c.completion_chat : undefined,
            tools: typeof c.function_calling === "boolean" ? c.function_calling : undefined,
            vision: typeof c.vision === "boolean" ? c.vision : undefined,
            fine_tune: typeof c.fine_tuning === "boolean" ? c.fine_tuning : undefined,
          },
          lifecycle: dep ? "deprecated" : "active",
          endOfLife: dep,
        };
      });
    case "bedrock":
      return arr(body?.modelSummaries).filter((m) => str(m?.modelId)).map((m) => {
        const lc = m.modelLifecycle ?? {};
        const status = String(lc.status ?? "ACTIVE").toUpperCase();
        const eol = lc.endOfLifeTime ? new Date(lc.endOfLifeTime).toISOString() : undefined;
        return {
          provider: id,
          id: m.modelId,
          name: str(m.modelName),
          owner: str(m.providerName),
          released: lc.startOfLifeTime ? new Date(lc.startOfLifeTime).toISOString() : undefined,
          inputModalities: arr(m.inputModalities).map(String),
          outputModalities: arr(m.outputModalities).map(String),
          reports: {
            streaming: typeof m.responseStreamingSupported === "boolean" ? m.responseStreamingSupported : undefined,
            fine_tune: Array.isArray(m.customizationsSupported) ? m.customizationsSupported.length > 0 : undefined,
          },
          lifecycle: status === "LEGACY" ? "legacy" : "active",
          endOfLife: eol,
        };
      });
    case "ollama":
      return arr(body?.models).filter((m) => str(m?.name)).map((m) => {
        const caps: string[] | undefined = Array.isArray(m.capabilities) ? m.capabilities.map(String) : undefined;
        const cloud = /[:-]cloud$/i.test(String(m.name));
        return {
          provider: id,
          id: m.name,
          name: [m.details?.family, m.details?.parameter_size, m.details?.quantization_level].filter(Boolean).join(" · ") || undefined,
          contextTokens: num(m.details?.context_length),
          // Ollama reports these itself (0.x "capabilities"). Older Ollama sends none, and then nothing is claimed.
          reports: caps
            ? { chat: caps.includes("completion"), tools: caps.includes("tools"), vision: caps.includes("vision") }
            : undefined,
          runsAt: cloud ? "provider cloud" : "this device",
        };
      });
  }
}

/**
 * Which live ids are the same model as a book entry, per provider.
 *
 * A family is not a match: "claude-sonnet-4-5" is not "Claude Sonnet 4", and
 * the version has to agree exactly. Dated snapshot suffixes are the same
 * model. Where a provider's ids never name a version (DeepSeek's API), the
 * book entry cannot be confirmed from that list and says so.
 */
export const BOOK_IDS: Record<string, Partial<Record<ProviderId, RegExp>>> = {
  "claude-opus-4": {
    anthropic: /^claude-opus-4(-\d{8})?$/,
    bedrock: /^anthropic\.claude-opus-4-\d{8}-v\d+:\d+$/,
  },
  "claude-sonnet-4": {
    anthropic: /^claude-sonnet-4(-\d{8})?$/,
    bedrock: /^anthropic\.claude-sonnet-4-\d{8}-v\d+:\d+$/,
  },
  "gpt-5": { openai: /^gpt-5(-\d{4}-\d{2}-\d{2})?$/ },
  "gemini-2.5": { google: /^gemini-2\.5-pro(-[a-z0-9-]+)?$/ },
  "grok-4.5": { xai: /^grok-4\.5(-[a-z0-9-]+)?$/ },
  // The book names no Mistral Large version, so only Mistral's own "latest" alias can stand for it.
  "mistral-large": { mistral: /^mistral-large-latest$/ },
  "llama-70b-local": { ollama: /^llama3\.3:70b/, nvidia: /^meta\/llama-3\.3-70b-instruct$/ },
  "qwen-local": { ollama: /^qwen2\.5:72b/ },
  "deepseek-v3": { nvidia: /^deepseek-ai\/deepseek-v3$/ },
};

/**
 * The provider whose own list decides whether a model still exists. A reseller
 * (Bedrock, NVIDIA) dropping a model is not the maker retiring it, so only the
 * maker's list can say "gone". Local weights have no maker list here, and
 * DeepSeek's ids never name a version, so those can never be called gone.
 */
export const BOOK_OWNER: Partial<Record<string, ProviderId>> = {
  "claude-opus-4": "anthropic",
  "claude-sonnet-4": "anthropic",
  "gpt-5": "openai",
  "gemini-2.5": "google",
  "grok-4.5": "xai",
  "mistral-large": "mistral",
};

export type BookStatus =
  /** At least one checked provider lists it and none marks it legacy. */
  | { state: "listed"; where: { provider: ProviderId; id: string }[] }
  /** Listed, but a provider marks it legacy or deprecated. */
  | { state: "retiring"; where: { provider: ProviderId; id: string; endOfLife?: string }[] }
  /** The maker's own list was checked and does not carry it, and no other checked provider does. */
  | { state: "gone"; checked: ProviderId[] }
  /** Not every provider that carries it was checked, and the checked ones do not list it. */
  | { state: "unconfirmed"; checked: ProviderId[]; unchecked: ProviderId[] };

export type LiveAtlas = {
  results: ProviderResult[];
  book: Record<string, BookStatus>;
  /** Listed by a checked provider, not in the book. ALGM has not characterized these. */
  unverified: LiveModel[];
};

export function liveAtlas(results: ProviderResult[]): LiveAtlas {
  const ok = new Map<ProviderId, LiveModel[]>();
  for (const r of results) if (r.state === "ok") ok.set(r.provider, r.models);

  const claimed = new Set<string>();
  const book: Record<string, BookStatus> = {};

  for (const m of MODELS) {
    const pats = BOOK_IDS[m.id] ?? {};
    const carriers = Object.keys(pats) as ProviderId[];
    const checked = carriers.filter((p) => ok.has(p));
    const unchecked = carriers.filter((p) => !ok.has(p));
    const hits: { provider: ProviderId; id: string; lifecycle?: string; endOfLife?: string }[] = [];
    for (const p of checked) {
      for (const lm of ok.get(p) ?? []) {
        if (pats[p]!.test(lm.id)) {
          hits.push({ provider: p, id: lm.id, lifecycle: lm.lifecycle, endOfLife: lm.endOfLife });
          claimed.add(`${p}:${lm.id}`);
        }
      }
    }
    if (hits.length) {
      const retiring = hits.filter((h) => h.lifecycle === "legacy" || h.lifecycle === "deprecated");
      book[m.id] = retiring.length
        ? { state: "retiring", where: retiring.map(({ provider, id, endOfLife }) => ({ provider, id, endOfLife })) }
        : { state: "listed", where: hits.map(({ provider, id }) => ({ provider, id })) };
    } else if (BOOK_OWNER[m.id] && ok.has(BOOK_OWNER[m.id]!)) {
      book[m.id] = { state: "gone", checked };
    } else {
      book[m.id] = { state: "unconfirmed", checked, unchecked };
    }
  }

  const unverified: LiveModel[] = [];
  for (const [p, models] of ok) {
    for (const lm of models) if (!claimed.has(`${p}:${lm.id}`)) unverified.push(lm);
  }
  return { results, book, unverified };
}
