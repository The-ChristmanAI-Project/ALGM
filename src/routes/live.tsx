import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { LivePip } from "@/components/marks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MODELS } from "@/lib/catalog";
import type { BookStatus, LiveAtlas, LiveModel, Provider, ProviderId, ProviderResult } from "@/lib/live/providers";
import { timeAgo } from "@/lib/utils";

export const Route = createFileRoute("/live")({ component: LivePage });

type Payload = {
  providers: Provider[];
  keys: Partial<Record<ProviderId, { set: true; last4: string }>>;
  atlas: LiveAtlas;
};

const day = (iso?: string) => (iso ? iso.slice(0, 10) : undefined);

function LivePage() {
  const [data, setData] = useState<Payload>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async (fresh: boolean) => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/live-atlas${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`ALGM's server answered ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const send = async (provider: ProviderId, body: { key?: string; clear?: true }) => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch("/api/live-atlas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, ...body }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out?.error ?? `ALGM's server answered ${res.status}`);
      setData(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const results = new Map<ProviderId, ProviderResult>((data?.atlas.results ?? []).map((r) => [r.provider, r]));

  return (
    <AppShell>
      <PageHeader
        kicker="Live atlas"
        title="What the providers say exists, right now."
        lede="Each provider is asked for its own model list. Nothing here is remembered from last week. A provider that was not asked says so, a provider that refused says what it answered, and a model ALGM has not characterized is shown as exactly that."
        action={
          <Button variant="secondary" disabled={loading} onClick={() => void load(true)}>
            {loading ? "Asking…" : "Ask again now"}
          </Button>
        }
      />

      {error && (
        <p className="mb-6 rounded-xl bg-bad/10 p-3 text-sm text-bad">{error}</p>
      )}

      {data && (
        <>
          <section className="mb-10">
            <h2 className="mb-3 text-[0.6875rem] tracking-[0.14em] text-muted uppercase">The book, checked against the providers</h2>
            <div className="grid gap-2">
              {MODELS.map((m) => (
                <BookRow key={m.id} name={m.name} status={data.atlas.book[m.id]} providers={data.providers} />
              ))}
            </div>
          </section>

          <section className="mb-10">
            <h2 className="mb-3 text-[0.6875rem] tracking-[0.14em] text-muted uppercase">Providers</h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {data.providers.map((p) => (
                <ProviderCard
                  key={p.id}
                  p={p}
                  result={results.get(p.id)}
                  keyInfo={data.keys[p.id]}
                  busy={loading}
                  onSave={(key) => void send(p.id, { key })}
                  onClear={() => void send(p.id, { clear: true })}
                />
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-1 text-[0.6875rem] tracking-[0.14em] text-muted uppercase">
              Listed live, not yet verified by ALGM · {data.atlas.unverified.length}
            </h2>
            <p className="mb-3 max-w-2xl text-sm text-muted">
              These exist — the provider lists them. ALGM has not characterized what they can do or where their data goes, so it scores none of them and recommends none of them.
            </p>
            <UnverifiedList models={data.atlas.unverified} providers={data.providers} />
          </section>
        </>
      )}
    </AppShell>
  );
}

function BookRow({ name, status, providers }: { name: string; status?: BookStatus; providers: Provider[] }) {
  const label = (id: ProviderId) => providers.find((p) => p.id === id)?.label ?? id;
  if (!status) return null;
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-surface p-3 shadow-[0_0_0_1px_var(--color-line)] sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-medium">{name}</p>
      {status.state === "listed" && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge tone="good">Listed live</Badge>
          {status.where.map((w) => `${label(w.provider)}: ${w.id}`).join(" · ")}
        </p>
      )}
      {status.state === "retiring" && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge tone="warn">Retiring</Badge>
          {status.where.map((w) => `${label(w.provider)}: ${w.id}${w.endOfLife ? ` · ends ${day(w.endOfLife)}` : ""}`).join(" · ")}
        </p>
      )}
      {status.state === "gone" && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge tone="bad">Not listed</Badge>
          Asked {status.checked.map(label).join(", ")} — none lists it. Retired or renamed.
        </p>
      )}
      {status.state === "unconfirmed" && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge>Unconfirmed</Badge>
          {status.unchecked.length ? `Not asked: ${status.unchecked.map(label).join(", ")}.` : ""}
          {status.checked.length ? ` Asked ${status.checked.map(label).join(", ")} — not listed there.` : ""}
          {!status.unchecked.length && !status.checked.length ? "No provider list can confirm this model." : ""}
        </p>
      )}
    </div>
  );
}

function ProviderCard({
  p, result, keyInfo, busy, onSave, onClear,
}: {
  p: Provider;
  result?: ProviderResult;
  keyInfo?: { set: true; last4: string };
  busy: boolean;
  onSave: (key: string) => void;
  onClear: () => void;
}) {
  const [key, setKey] = useState("");
  const takesKey = p.auth === "key" || p.id === "nvidia";
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-[0_0_0_1px_var(--color-line)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{p.label}</p>
        {!result && <Badge>Not asked yet</Badge>}
        {result?.state === "ok" && <Badge tone="good">{result.models.length} models</Badge>}
        {result?.state === "no_key" && <Badge>Not asked</Badge>}
        {result?.state === "refused" && <Badge tone="bad">Refused · {result.status}</Badge>}
        {result?.state === "unreachable" && <Badge tone="warn">Unreachable</Badge>}
      </div>
      <p className="mt-1 break-all font-mono text-[0.6875rem] text-faint">{p.source}</p>
      <p className="mt-2 text-xs text-muted">{p.gives}</p>
      {result && (
        <p className="mt-2 flex items-center gap-2 text-xs text-muted">
          {result.state === "ok" && <LivePip />}
          {result.state === "ok" ? "Answered" : result.state === "no_key" ? result.detail : `${result.detail}`}
          {" · "}
          {timeAgo(Date.parse(result.checkedAt))}
        </p>
      )}
      {takesKey && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (key.trim()) onSave(key);
            setKey("");
          }}
        >
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={keyInfo ? `Key set · ends ${keyInfo.last4}` : p.auth === "key" ? "Paste API key" : "Optional key"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            aria-label={`${p.label} API key`}
          />
          <Button type="submit" size="sm" className="h-11" disabled={busy || !key.trim()}>
            Save
          </Button>
          {keyInfo && (
            <Button type="button" size="sm" variant="danger" className="h-11" disabled={busy} onClick={onClear}>
              Clear
            </Button>
          )}
        </form>
      )}
      {p.auth === "aws" && (
        <p className="mt-3 text-xs text-faint">Uses this machine's AWS identity. No key is stored in ALGM.</p>
      )}
    </div>
  );
}

function UnverifiedList({ models, providers }: { models: LiveModel[]; providers: Provider[] }) {
  if (!models.length) return <p className="text-sm text-faint">None from the providers that answered.</p>;
  const by = new Map<ProviderId, LiveModel[]>();
  for (const m of models) by.set(m.provider, [...(by.get(m.provider) ?? []), m]);
  return (
    <div className="grid gap-4">
      {[...by.entries()].map(([pid, list]) => (
        <details key={pid} className="rounded-2xl bg-surface p-4 shadow-[0_0_0_1px_var(--color-line)]">
          <summary className="cursor-pointer text-sm font-medium">
            {providers.find((p) => p.id === pid)?.label ?? pid} · {list.length}
          </summary>
          <ul className="mt-3 grid gap-1.5">
            {list.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-fg">{m.id}</span>
                {m.name && <span className="text-muted">{m.name}</span>}
                {m.lifecycle && m.lifecycle !== "active" && (
                  <Badge tone="warn">{m.lifecycle}{m.endOfLife ? ` · ends ${day(m.endOfLife)}` : ""}</Badge>
                )}
                {m.runsAt === "provider cloud" && <Badge tone="bad">Runs in the provider's cloud · leaves this device</Badge>}
                {m.runsAt === "this device" && <Badge tone="good">On this device</Badge>}
                {m.reports && (
                  <span className="text-faint">
                    reports: {(Object.entries(m.reports) as [string, boolean | undefined][]).filter(([, v]) => v).map(([k]) => k.replace("_", "-")).join(", ") || "none"}
                  </span>
                )}
                {m.contextTokens && <span className="text-faint">{m.contextTokens.toLocaleString()} tokens in</span>}
                {m.inputModalities?.length ? <span className="text-faint">in: {m.inputModalities.join(", ").toLowerCase()}</span> : null}
                {m.released && <span className="text-faint">released {day(m.released)}</span>}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
