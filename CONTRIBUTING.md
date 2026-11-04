# Contributing

## Commits

Every commit carries the co-author trailer, because the work is done in a conversation with the harness:

```
Co-Authored-By: DeepSeek Harness <noreply@deepseek.com>
```

Keep it at the end of the message, after a blank line. It is not a GitHub account, so it does not change
the contributor count on the repository page; it is the record on the commit itself.

## Before a commit

```powershell
npm test        # check-sources, build, then the nine suites (667 assertions)
```

`node build.mjs` writes `client.js`; commit it together with the `src/` change it came from.

## What the plugin is

The notebook described in the README, and nothing else: one page that typesets as you type, suggestions on
a pause, structure and translation on a draft, history that edits in place, and a board backed by a real
session. Changes should keep that shape — see the layout and mirror suites for the invariants that have
already been worth pinning.
