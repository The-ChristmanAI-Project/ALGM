# ALGM — Advanced Learning Guidance Management

**Know the door before you walk through it.**

Ask what you want to do — _"I want to swarm with Claude"_ — and ALGM tells you
whether that specific model, in that specific environment, can actually do it.
Not whether the brand can. Not whether the marketing says so. Whether **that
door** can.

It runs on your machine, holds an atlas of 9 models across 13 capabilities and
every environment each one ships, and refuses to pretend.

## The three rules, which are not settings

|                  |                                                            |
| ---------------- | ---------------------------------------------------------- |
| **No gates**     | ALGM never locks a door. It tells you where the door goes. |
| **No off**       | Honesty cannot be switched off. There is no toggle.        |
| **No craziness** | No silent updates, no dark patterns, no pretend swarms.    |

ALGM **does not encrypt, tunnel, or block traffic.** It tells you the path so
you can choose a different door. That is the whole honesty contract, and the
test suite enforces it.

---

## Running it

Requires **Node 22 or newer** (`npm test` uses `--experimental-strip-types`).

```bash
npm ci          # install exactly what the lockfile pins
npm run dev     # http://127.0.0.1:9099
```

Or the restart script, which is idempotent — it probes first, starts only what
is down, and fails loudly with the log if the server dies:

```bash
sh startup.sh
```

| Command                             | What it does                               |
| ----------------------------------- | ------------------------------------------ |
| `npm run dev`                       | Dev server on `9099`                       |
| `npm run build`                     | Production build                           |
| `npm run preview`                   | Serve the built output on `127.0.0.1:9099` |
| `npm run preview:restart` / `:stop` | Manage that preview server                 |
| `npm test`                          | The catalog and advisor suites             |
| `npm run typecheck`                 | `tsc --noEmit`                             |
| `npm run lint`                      | ESLint                                     |
| `npm run format`                    | Prettier                                   |

---

## What is in the atlas

Nine models, each with every environment it actually ships — and capabilities
are recorded **per environment**, because that is the entire point. Claude on
claude.ai is not Claude on Bedrock.

| Model                 | Provider                       |
| --------------------- | ------------------------------ |
| Grok 4.5              | xAI                            |
| Claude Opus 4         | Anthropic                      |
| Claude Sonnet 4       | Anthropic                      |
| GPT-5                 | OpenAI                         |
| Gemini 2.5 Pro        | Google                         |
| Llama 3.3 70B (local) | Meta weights · your runtime    |
| Qwen 2.5 72B (local)  | Alibaba weights · your runtime |
| Mistral Large         | Mistral                        |
| DeepSeek V3           | DeepSeek                       |

Thirteen capabilities: multi-agent swarm, tool use, computer use, vision, image
generation, video generation, voice, code execution, web search, long context,
fine-tune, offline, on-device.

Each is `yes`, `limited`, or `no` — never a blank. Every environment also
carries a **data policy**: whether the path leaves the device, the training
stance, retention, subprocessors, and an **honesty score** with the reason it
scored that way.

---

## Using it

**Command** — the overview: live origin per model, honesty drift, and anything
held for inspection.

**Advisor** — type what you want to do. You get a verdict (`allowed`,
`limited`, `blocked`, `privacy`, or `unknown`), why, what to watch, and
alternatives that genuinely can do it. "Explain with Grok" is the one step that
leaves the device — it sends the verdict to the xAI API, and the UI says so
plainly rather than hiding it.

**Honesty** — claimed origin against observed path, and where they diverge.

**Stack** — the atlas of every door. Picking one here asks the advisor about
_that exact door_.

**Learn / Rules / Watch** — the lessons, the covenant, and the inspection queue.

---

## What it is not

- **It does not make a model more capable.** It tells you what the door already
  does. A chat website will not grow a swarm because you asked nicely.
- **It does not protect traffic.** No encryption, no tunnel, no blocking. Naming
  the path is the product.
- **The honesty score is a judgement, not a measurement.** It is an explained
  0–100 opinion about how well the claimed origin matches the observed path.
- **The advisor matches on keywords**, not a model. It is deterministic — the
  same question always gives the same answer — but a question phrased outside
  the known aliases returns `unknown` rather than a guess.

---

## For maintainers

### The line that must hold

ALGM's value is that it does not overclaim. That is enforced in
`src/lib/__tests__/`, not just in copy:

- No consumer web UI is ever credited with a native swarm.
- `on_device` and `offline` are granted **only** to a local runtime.
- A local runtime never claims to leave the device; a hosted one never claims to
  stay.
- Alternatives only point at doors that actually work, and never back at the one
  just refused.
- A blocked verdict never reads as permission.
- ALGM never claims to encrypt, tunnel, or anonymise.

If a change would make ALGM overclaim, it is the wrong change.

### Answering about the right door

`advise(query)` detects the model from free text. `adviseStructured(modelId,
envId, cap)` does **not** — it uses the ids directly. Both land in the same
`verdictFor()`.

That split exists because of a real bug: `adviseStructured` used to build a
sentence from the ids and hand it back to `advise`, which re-detected the model
from that text. Alias matching scores the environment label too, so _"swarm with
Sonnet 4 in Anthropic API"_ matched Opus's `anthropic` alias as strongly as
Sonnet's own — and asking about Sonnet returned a verdict about Opus. Never
route a structured request through text detection.

### Adding a model or environment

Every environment needs a `label`, `kind`, `region`, `facility`, `notes`,
capability levels, and a full `data` policy including an `honesty` score and the
`honestyWhy` that justifies it. The catalog suite asserts all of it, including
that `defaultEnv` actually exists on the model and that aliases are lowercase —
matching normalises first, so an uppercase alias silently never matches.

### The gate

```bash
npm test && npm run typecheck && npm run lint && npm run build
```

All four, every time. The **build** step matters most: dev and the production
build fail independently in this stack. CI runs exactly these on every push to
`main` and every PR.

For UI changes, also look at it in a browser — a blank page returns HTTP 200.
Drive it with Playwright against `http://127.0.0.1:9099`.

### Layout

```
src/lib/catalog.ts     MODELS, CAPABILITIES, lookups — the atlas
src/lib/advisor.ts     query -> Verdict; detection, verdictFor, alternatives
src/lib/guide.ts       the one outbound call: xAI, for "Explain with Grok"
src/lib/types.ts       Model, Environment, DataPolicy, Verdict
src/lib/__tests__/     the promises above, enforced
src/routes/            command, advisor, honesty, learn, rules, stack, watch
```

`.vercel/output/` is committed build output, so every build dirties the working
tree. Regenerate and stage it, or stop tracking it.
