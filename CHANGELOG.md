# Changelog

<!-- Keep the newest entry on top. A version bump means: build, run every suite, then tag. -->

## 1.0.0 — first official release

The notebook as it is meant to be used: type into one box, read the typeset result beside it, and
call the model only when judgement is needed.

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

