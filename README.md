# The notebook: how it works and where to look

`@local/dsh-notes` — a local notebook inside DSH, in three tabs.

| Tab | What it is |
| --- | --- |
| 记录 | One box, two pages. The right page is Format, running live on every keystroke; the toolbar's「结构化」button adds an AI rewrite above it. |
| 历史 | The grouped history with Markdown rendering, search, tags, a collapsible list drawer, and a **copilot sidebar** beside the open note. |
| 看板 | Statistics over the notebook and its usage, plus the host's **native conversation** running the `notes-board` agent preset. |

### The four actions

| Action | Input | Lands in | Changes language |
| --- | --- | --- | --- |
| **Format** | the note, always | right page, live (no request, no button) | no |
| **Structure** | the note; the selection when there is one | an AI draft on the right page (Apply / Save / Translate) | never |
| **Translate** | the AI draft in place, **or** the note itself (selection, else whole) from the live preview | a draft edit / a proposal with Apply | yes |
| **Apply** | draft or proposal | back into the source, replacing only the range | — |

Format is deterministic (`formatLocally`), which is why it needs no button and no
model: separators, numbering, blank lines and stray stars are normalised, wording is
never touched, and the pass is idempotent. Saving a note writes the laid-out text, so
the right page is a promise rather than a hint. A selection in the editor highlights
the same lines in the preview; translate then works on that span.

Capture also works outside the panel: `Alt+N` or the small notebook icon in the
composer tool row opens a floating capture card, and `/note 内容` saves a note
straight from the chat box.

## Where notes live

`notes.json` is the source of truth: human-readable, diffable, and safe under
OneDrive. Everything else is derived.

```
<workspace>/notes-vault/
  notes.json      live notes (source of truth)
  trash.json      deleted notes, kept as a safety net
  links.json      which session belongs to the notebook
  events.jsonl    append-only instrumentation: AI calls, UI actions, charts
  dashboard.json  charts pinned to the dashboard
  index.db        SQLite projection of the above, for the query tools
```

`notesPath` in `cordis.patch.yml` changes the directory; a relative path anchors
on the **default workspace from the registry**, not on whichever session calls
first.

## Three AI surfaces, three different mechanisms

The distinction matters, and getting it wrong is what made an earlier version
send a truncated text dump into a prompt.

1. **Structuring** (`/notes/api/enhance/stream`) — a single streamed model call.
   No session, no tools. `start`, `delta`…, `done` with `{title, body, tags}`.
   Reasoning effort is set to `off`; measured ≈0.5 s to first token.
2. **Copilot** (`/notes/api/copilot/stream`) — also a single streamed call, per
   action (续写 / 润色 / 翻译 / 展开 / 摘要 / 提问) over the selection or the whole
   note. The answer streams in; 「加到文末」「替换选中」「替换全文」 write it into
   the editor, which stays reviewable before saving.
3. **The dashboard chat** — a **real agent session** on the `notes-board` preset,
   rendered with the host's own Conversation component. It has tools, so it
   queries instead of guessing:

   | Tool | What it does |
   | --- | --- |
   | `notes_query` | one guarded `SELECT` against `index.db` (read-only, single statement, ≤500 rows, `?` params) |
   | `notes_analyze` | preset aggregates: `by_tag`, `by_source`, `by_day`, `by_hour`, `lengths`, `terms`, `ai_usage`, `timeline` |
   | `dashboard_chart` | add/replace a pinned chart on the dashboard |
   | `notes` | read and write the notes themselves |

   The panel only creates the session (`POST /notes/api/session/create`) and
   renders it. Delivery, streaming, tool cards and approvals are the framework's:
   the user types into the native composer, so no turn is ever pushed by hand.

## The database

`lib/db.js` maintains a SQLite projection (`index.db`) with four tables:

| Table | Contents |
| --- | --- |
| `notes` | one row per note, `body` is the full text |
| `note_tags` | one row per (note, tag), so tags are a `GROUP BY` |
| `events` | every AI call and UI action, with latency and outcome |
| `messages` | the dashboard conversation transcript, keyed by `(session_id, seq)` |

Two rules keep it honest:

- **It is disposable.** Delete `index.db` and it rebuilds from the JSON on the
  next read. A cache must never hold data the files do not.
- **It opens lazily and closes with the plugin.** Windows locks an open database
  file, so the disposer releases it before the directory could be moved.

`node:sqlite` ships with the app's own runtime (Node 24). If it is ever missing,
the query tools disable themselves and say so; the rest of the notebook works.

## Instrumentation

Every AI call appends one line to `events.jsonl` — kind, characters, elapsed time,
time to first token, success. UI beacons (`POST /notes/api/event`) record what the
user did: tab switches, note opens, copilot inserts, chart removals. The dashboard
conversation is ingested into `messages` on each poll, keyed by sequence number so
re-reading is idempotent.

That is what the 「AI 使用」tile and the average-first-token figure come from, and
what lets the assistant answer "what did I ask you last week".

## Files

| File | Role |
| --- | --- |
| `index.js` | Host half: the `notes` service, tools, command, data plane. |
| `lib/store.js` | The notebook files: notes, trash, links, search. |
| `lib/db.js` | The SQLite projection and its guarded queries. |
| `lib/text.js` | Term extraction (non-overlapping CJK bigrams, English words). |
| `lib/analytics.js` | Pure statistics for the dashboard. |
| `lib/events.js` | The event log and the pinned-chart store. |
| `lib/llm.js` | Streamed model call, reasoning-effort selection, timing. |
| `lib/chat.js` | The copilot stream. |
| `lib/prompt.js` | Prompts and parsers: structuring, copilot actions. |
| `lib/tools.js` | Tool adapters: query, analyze, chart, notes, enhance. |
| `lib/api.js` | `/notes/api` routes, including the SSE streams. |
| `src/head.js` | Browser prologue: i18n, api helpers, formatting, Markdown, styles. |
| `src/board.js` | Dashboard: chart renderers, statistics view, editor copilot. |
| `src/panel.js` | Panel: tabs, capture, history, session shell, mount points. |
| `build.mjs` | Concatenates the three sources into `client.js`. |
| `tools/check-sources.mjs` | Parses the browser sources the way `build.mjs` wraps them. |
| `tools/fix-encoding.mjs` | Repairs a CJK string written through a byte-mangling pipeline. |
| `test/host.mjs` | Store, prompts, event log, chart store, tool adapters. |
| `test/prompts.mjs` | Copilot message shape and term extraction. |
| `test/api.mjs` | The whole data plane in-process, including both SSE streams. |
| `test/render.mjs` | Slot wiring, tabs, dashboard and copilot rendering. |
| `test/markdown.mjs` | Markdown rendering, snippets, tags, the drawer switch. |

## Working on it

This directory is its own git repository; the first commit is the baseline the
rest of the work is measured against.

```powershell
node tools/check-sources.mjs     # syntax check for the factory-bodied sources
node build.mjs                   # src/*.js -> client.js
node --check client.js
node tools/fix-encoding.mjs      # repair double-encoded CJK (only after a bad write)
```

The suites, in the order they are usually run:

| Suite | What it covers |
| --- | --- |
| `test/host.mjs` | store, analytics, API routing |
| `test/prompts.mjs` | structuring prompt, Markdown parsing, title rules |
| `test/api.mjs` | routes end to end with a fake model |
| `test/render.mjs` | component trees (Capture, History, Board, Copilot) |
| `test/markdown.mjs` | rendering, snippets, tags, outline markers |
| `test/document.mjs` | whole documents: coverage repair, index-aligned assembly, typography gate |
| `test/layout.mjs` | dock layout contract + a preview page for the composer pinning |
| `test/corpus.mjs` | live run against the app: 11 inputs → structure → render → translate |

`client.js` is generated and is **not** committed: run `node build.mjs` after a
clone, before starting the app. `exports/` holds generated previews and is also
ignored.

## Notes for maintainers

- Edit `src/`, then `node build.mjs`. `node --check src/panel.js` fails by design
  (the files are factory bodies); use `node tools/check-sources.mjs`.
- **`STYLES` and the i18n dictionaries live in a template literal.** A backtick in
  a CSS comment, or a `${` in prose, silently truncates the string.
- **Never rewrite these files through PowerShell text pipelines.** `Get-Content
  -Raw` reads them as ANSI and `Set-Content` writes UTF-8, which double-encodes
  every CJK string. Use the file tools, or Node with explicit UTF-8.
- No `Config` export: a profile-installed bundle resolves only its own
  dependencies, so no schema library is imported.
- Optional services (`commands`, `webServer`, `layout`, `llm`,
  `agentDefaultModel`, `sessionController`, `sessions`) are read through
  `ctx.get(...)`, never `ctx.<name>`: cordis throws on an undeclared property read.
- The panel declares a `notes.board.conversation` child slot; that declaration is
  what makes the framework inject `SessionProvider` + `renderSlot`.
- The shell strips a slot `children` array before rendering the panel.
- A key like `notes` is used by both the sidebar icon and the main panel; select
  the panel by slot name in tests, not by key.
- Every visible style is a `--dsw-alias-*` token; literal colors appear only in
  `icon.svg`… with one deliberate exception: the contribution matrix uses GitHub's
  exact five-step green ramp (`--dshn-heat-0..4`, with GitHub's dark variant under
  `prefers-color-scheme: dark`). Opacity over an accent colour cannot reproduce
  that ramp, and matching it is the point — so it is pinned, in one place, and
  named here rather than hidden.

## The contribution matrix

One column per week, one cell per day, a year of days. Intensity is quantised by
**quartiles of the non-zero counts**, as GitHub does, not by a ratio to the peak:
a notebook with one note a day therefore shows one light shade rather than
painting every day in the darkest green. The busiest day is always the darkest.
`src/board.js` (Heatmap) draws it; `lib/analytics.js` (`calendarYear`) supplies a
Sunday-aligned series so the renderer needs no date arithmetic.
- **Host-side changes need an app restart**; client-side changes need a refresh.
