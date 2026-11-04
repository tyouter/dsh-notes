# Changelog

## 1.1.2 — what the notebook does

### One page, typeset as you write

- One editor, one live page: spaces make structure (two for a bullet, four for the next level), Enter
  continues the level, Backspace backs out of it, and the right page is set as you type.
- Saving stores the page you see; opening a note shows the same text back.

### Suggestions

- A one-second pause brings a continuation. The note's own wording is tried first, with no model call;
  when that finds nothing the model is asked, under rules that forbid invented names, dates, numbers and
  links and cap the answer at three sentences.
- TAB accepts one chunk, the accepted span is marked, and one Backspace removes it. A suggestion that
  starts with a list marker starts its own line; a suggestion is never drawn through existing text.
- **Auto-write** turns all of this off: no suggestions and no requests.

### Structure and translate

- **Structure** rewrites the whole note, or only the selection, into a draft on the right page. The note
  itself changes only on Apply. A selection draft keeps the selection's item count.
- **Translate** takes the draft (or the note, from the live preview) into the chosen language; discarding
  is one click.

### History

- The list is searchable and filterable by tag, resizable by dragging the seam, collapsible to a drawer.
- The detail pane edits in place with the same two pages, pins with one icon, and **Copy** writes standard
  Markdown to the clipboard with a tick to confirm it.

### The board

- Statistics and pinned charts from the notebook itself, plus a native agent session that answers
  questions with `notes_query` / `notes_analyze` and pins what it builds with `dashboard_chart`.
- The session's composer stays at the bottom of the column; the quick-note pane covers it when open.

### Details

- The data lives in plain JSON under `notes-vault/`; deleting the SQLite projection loses nothing, and a
  change made on disk by another window is picked up on the next read.
- Copy-as-Markdown, translated labels, and the board's session all follow the host's own locale and theme.
- 667 assertions across nine suites, including a 500-state sweep of the mark layer.

## 1.1.1 — a release that behaves like a tool

Fifteen fixes and additions on top of 1.1.0, all of them things you notice while actually writing.

### Completion

- <kbd>TAB</kbd> is a loop: accept a chunk, pause, the next suggestion appears, accept again — the
  editor never loses focus, and the accepted chunk is drawn with the plugin's own green mark so one
  <kbd>Backspace</kbd> takes it back.
- Enter accepts what TAB inserted: the mark clears, the caret moves to the new line, and the next
  suggestion follows the caret instead of staying at the old offset.
- A suggestion never restates the note. In a list the prompt asks for a **new** item, and a candidate
  that duplicates an existing line (markers and punctuation ignored) is dropped before it is shown.
- **Auto-write** switch in the toolbar, green when on. Off means no suggestion and no request at all —
  not a timer, not a token.

### The preview page

- It only exists when there is something to show: an empty draft has no right-hand page.
- A drawer handle on the seam between the two pages collapses and expands it, and Structure opens it
  automatically when it was closed.
- Hiding never stretches the editor: the hidden page keeps its column, so the pair keeps the geometry
  it has when both are visible.

### History

- The detail pane finally has a width (it had no rule at all, so it shrank to its content) and its
  content starts level with the first card.
- The action bar has a hierarchy: pin is an icon that fills in when on, Edit is the only filled button,
  delete only reddens on hover — all pinned to the right edge.
- Collapsing the list hands the width to the editor (a rule of mine was overriding the drawer's
  `width: 0`).
- **Copy as Markdown**: one button beside Edit puts the note on the clipboard as standard Markdown
  (`# ` title, `1.` numbering, `-` bullets, indentation as nesting), with a tick that pops in and
  reverts after 1.4s.

### Freshness

- Opening the plugin no longer shows a cached notebook: the store reloads when `notes.json` (or
  trash/links) changes on disk — another window, an editor, a sync — and the panel refreshes on a tab
  switch, on window focus and on visibility change.

### Engineering

- 620 assertions across eight suites, plus the 17-case live corpus.

## 1.1.0 — one editor, and typing that keeps up

The release where the notebook stopped having two editors and started guessing what you were about to
type.

### One editor, not two

- Editing a note in 历史 now mounts the same `CaptureBox` the 记录 tab uses: source on the left, the
  laid-out result on the right, Structure / Cancel / Save in the toolbar. The separate editor and its
  "copilot" sidebar — six magic actions, three insert buttons, its own route, prompt, CSS and event
  kinds — are gone (about 1,100 lines).
- Saving is unified: every path stores the laid-out text, and editing leaves the source showing
  exactly what was written. Reopening a note can no longer surprise you.

### 极简写: typing is structure

- Two spaces at the start of a line make a bullet the moment they are typed, whatever the tap speed;
  four spaces make it nested. A deeper indent is one level down relative to the item above.
- Enter on a bullet continues at the same level, marker included.
- Backspace inside the marker backs out one level; at the first level it turns the bullet back into
  prose. A held space is just spaces again — one way to back out, not two.
- TAB is reserved for completion and never indents.
- The preview keeps nesting: each `<li>` carries its depth, so a child gets ◦ and a step in, a
  grandchild ▪ and another.

### Completion

- After typing stops for 1s — and only after typing; focusing the box does nothing, and a keystroke
  before the second cancels the request and aborts it in flight.
- The note answers first: the longest run ending at the caret that already appears earlier in the
  document is finished from there, with no request and no cost.
- Only then the model, with a prompt that forbids invented names, dates, numbers and links, forbids
  summarising, caps itself at three sentences, and may answer with nothing.
- TAB takes one chunk (a sentence, or a clause when the sentence is long), leaves it selected so a
  single Backspace removes it, and releases the selection after 1.4s so later Backspaces delete
  characters.

### History

- The list column is draggable (200–520 px, remembered, double-click resets).
- Cards clamp to two lines, so the list reads as a list.
- Action buttons are larger, bordered and on the right, with the primary action emphasised.

### Fixed

- The selection highlight sits exactly under the text in every layout (one box, one set of metrics).
- The title block takes the selection mark, so selecting the first line highlights what it displays.
- Indented lines no longer merge into one bullet, and no longer render as plain paragraphs.
- One busy chip instead of two, static, with elapsed seconds.
- The board's quick note fills its dock and splits 50/50.

### Engineering

- A `test/typing.mjs` suite simulates the editor the way a person types — every character as input,
  Enter before the newline exists, a slow double tap as slow — because the space bug that shipped in
  1.0.0 was invisible to the pure-function checks. 566 assertions across eight suites, plus the
  17-case live corpus.

## 1.0.0 — first official release

The notebook as it is meant to be used: type into one box, read the typeset result beside it, and
call the model only when judgement is needed.

Shipped as @tyouter/dsh-notes, MIT licensed, as a single bundle: the host half, the web panel and
the three agent presets the board assistant needs all come from one install.

### The two pages

- **Format runs live.** `formatLocally` normalises dashes, stray stars, numbering, blank lines and
  trailing spaces on every keystroke. No request, no button, idempotent, and it never rewrites a
  word. Saving a note writes the laid-out text, so the right page is a promise.
- **Structure is the AI pass.** It reorganises an unstructured draft, writes the title, and lands
  on the same page as a draft with Apply / Save as note / Translate.
- **The title is the first line, displayed larger.** It is not copied and not removed from the
  data: the editor keeps every character, the preview styles line one as a title, and the title
  takes the selection highlight like any other line.
- **The board's quick note previews above the input.** The compact pane fills its dock and splits
  the two sheets 50/50, each with its own scrolling.

### Text handling

- Any outline marker parses and keeps its level: `一、` / `1.` / `1)` / `a)` / `I.` / `①` /
  `（一）`. Levels are derived from the marker shapes, counters run per level, and CJK numerals
  become Arabic only for a Latin-script target.
- Low-effort input is the default assumption: spaces, numbers, dashes, colon labels, times
  (`9:40` is a time, not a marker) and arrows. A checklist is something the model derives, never
  something the user has to type.
- A single newline is a line the author wrote: paragraphs keep their breaks.

### Translation

- Two entry points: the structuring draft translates in place; the live preview translates the
  selection, or the whole note when there is no selection, as a proposal.
- The draft goes out as numbered lines and is reassembled by index, so a merge or an omission
  cannot shorten the result. A missing line falls back to the source.
- A selection in the editor highlights the same lines in the preview, including the title line.

### Progress and safety

- No half-written Markdown: a call shows a spinner with a fixed label and elapsed seconds in the
  toolbar, and the result is revealed with an ink wipe. `prefers-reduced-motion` turns it off.
- Coverage repair re-inserts any source line a rewrite dropped, in place; markup restore puts back
  `##` headings, `>` quotes and `-` bullets the model removed.
- A typography gate reports concrete defects and re-asks once, with the defects named.

### Engineering

- Seven suites, 522 assertions: host, prompts, api, render, markdown, document, layout. Plus a
  live corpus of 16 inputs that runs against the running app.
- `client.js` is generated (`node build.mjs`) and not committed; host changes need an app restart,
  client changes a page refresh.

