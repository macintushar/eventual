---
name: opencode-subagent
description: Delegate coding tasks to OpenCode as a headless subagent from bash. Use when you need to hand off an isolated task to a separate agent, run work in a different repo/directory, get a second model's opinion, parallelize independent tasks, or drive OpenCode non-interactively. Covers `opencode run`, session chaining, output parsing, structured result extraction, and permission control.
---

# OpenCode as a subagent

Drive [OpenCode](https://opencode.ai) headlessly via `opencode run` to delegate a task to a
separate agent process. The subagent gets its own context, its own model, and its own working
directory — you get back text plus, if you want it, structured cost/diff/token data.

Verified against **opencode 1.18.11**. Run `opencode --version`; if it differs, re-check flags
with `opencode run --help` before trusting the details here.

## Preflight

```bash
opencode --version              # confirm installed
opencode providers list         # confirm a provider is authenticated
```

If `providers list` shows no credentials, stop and tell the user to run `opencode auth login`
themselves — it is an interactive prompt and you cannot complete it.

> `providers` is the real command name in 1.18.11; `auth` is a still-working alias. The published
> docs use `auth`.

## The two rules that matter

**1. Always redirect stdin from `/dev/null`.**

`opencode run` reads stdin. When an agent shells out, stdin is usually an inherited pipe that
never closes, so opencode blocks **forever** — silently. No output, no error, ~0% CPU, no network
connection, and its log stops dead after `init`. It looks exactly like a slow model call. Verified:

```bash
opencode run "say hi"                 # hangs indefinitely
opencode run "say hi" < /dev/null     # exits 0 in seconds
```

Put `< /dev/null` on every single `opencode run`. This is the number one way this fails.

**2. Never run bare `opencode`, `opencode tui`, `opencode web`, `opencode attach`, or
`opencode run -i`.** Those launch an interactive UI and will hang until you time out.

## Basic delegation

```bash
opencode run "Add a --json flag to src/cli.ts and update the tests" < /dev/null
```

Quote the whole prompt as one argument. The positional is an array, so an unquoted prompt gets
split on spaces and shell-globbed.

### Let it actually do the work

By default OpenCode asks for permission before edits and bash commands. In a non-interactive
call there is nobody to answer, so it stalls. For an autonomous subagent you must pass `--auto`:

```bash
opencode run --auto "Fix the failing test in tests/parser_test.go" < /dev/null
```

`--auto` approves everything not explicitly denied — it lets the subagent edit files and run
shell commands unsupervised. Use it when the user has asked for autonomous work. If you want
the subagent to look but not touch, skip `--auto` and give it a read-only task, or point it at a
purpose-built agent (see *Restricting tools*).

### Working directory

`--dir` runs the subagent against another project without changing your own cwd:

```bash
opencode run --dir ~/code/other-repo --auto "Summarize the auth flow in this codebase" < /dev/null
```

### Picking a model

```bash
opencode models                 # list everything available
opencode models anthropic       # filter to one provider
```

```bash
opencode run -m anthropic/claude-sonnet-5 "Review this diff for race conditions" < /dev/null
opencode run -m openai/gpt-5.6-sol --variant high "Design the migration plan" < /dev/null
```

`--variant` sets provider-specific reasoning effort (`minimal`, `high`, `max`, …). Use a
different model than your own when the point is a genuine second opinion.

### Attaching files

```bash
opencode run -f src/parser.ts -f tests/parser_test.ts "Why does the second test fail?" < /dev/null
```

## Always bound the call

A subagent on a large task can run for many minutes. Cap it, or a hang becomes your hang.
macOS has no `timeout` by default — use `gtimeout` (coreutils) or Perl:

```bash
perl -e 'alarm 600; exec @ARGV' opencode run --auto "…" < /dev/null
```

Prefer the Bash tool's own `timeout` parameter as the primary bound, and consider
`run_in_background: true` for long delegations so you stay responsive.

## Parsing the output

`opencode run` writes ANSI escape codes and a header line to stdout **even when piped**. Raw
bytes of a real run:

```
\e[0m
> build · gpt-5.6-sol
\e[0m
PONG
```

So the first three lines are banner, not answer. To get just the reply:

```bash
opencode run "…" < /dev/null 2>/dev/null | sed $'s/\e\\[[0-9;]*m//g' | tail -n +4
```

This is fragile — the banner line count is not a documented contract. **Prefer `--format json`**
(next section) for anything you intend to parse; use the default format only when a human is
reading the output.

## Structured results — prefer `--format json`

`--format json` emits **NDJSON**: one JSON object per line, no ANSI, no banner. This is the best
programmatic interface, and it hands you the session ID directly — no lookup, no race.

```bash
opencode run --auto --format json "Fix the failing parser test" < /dev/null > out.ndjson
```

Real output (one line each, abridged):

```json
{"type":"step_start","timestamp":…,"sessionID":"ses_03dd…","part":{…}}
{"type":"text","timestamp":…,"sessionID":"ses_03dd…","part":{"type":"text","text":"PONG",…}}
{"type":"step_finish","timestamp":…,"sessionID":"ses_03dd…","part":{"reason":"stop","tokens":{"total":14917,"input":14911,"output":6,"reasoning":0,"cache":{"write":0,"read":0}},"cost":0}}
```

Every event carries `type`, `timestamp`, `sessionID`, and `part`. Text lives at
`part.text` on `type == "text"`; `step_finish` carries `part.tokens`, `part.cost`, and
`part.reason` (`"stop"` on clean completion). Parse it:

```bash
python3 -c '
import json,sys
text, sid, cost, toks, reason = [], None, 0, None, None
for line in open("out.ndjson"):
    if not line.strip(): continue
    e = json.loads(line); sid = e.get("sessionID", sid)
    if e["type"] == "text": text.append(e["part"]["text"])
    if e["type"] == "step_finish":
        cost += e["part"].get("cost", 0)
        toks = e["part"].get("tokens"); reason = e["part"].get("reason")
print("".join(text)); print("session:", sid, "| cost:", cost, "| stop:", reason)
'
```

Because it is line-delimited, you can also stream it live — `tail -f out.ndjson` while the
subagent runs, or pipe through `jq -c 'select(.type=="text") | .part.text'`.

Don't confuse the event `type` values (`step_start`, `text`, `step_finish` — underscores) with
the `part.type` values (`step-start`, `text`, `step-finish` — hyphens).

### Session export

To inspect a finished session, or to get the diff stats the event stream doesn't include:

```bash
opencode export "$SID" > result.json
```

Returns `{ "info": {...}, "messages": [...] }`. Useful fields on `info`:

| Field | Meaning |
|---|---|
| `cost` | dollar cost of the session |
| `tokens` | `{input, output, reasoning, cache:{read,write}}` |
| `summary` | `{additions, deletions, files}` — how much code changed |
| `model` | `{id, providerID, variant}` actually used |
| `agent` | agent that ran |

Pull the final answer and the diff stats:

```bash
python3 -c '
import json,sys
d=json.load(open("result.json"))
text=[p["text"] for m in d["messages"] if m["info"]["role"]=="assistant"
      for p in m.get("parts",[]) if p.get("type")=="text"]
print("\n".join(text))
print("--- files:%(files)s +%(additions)s -%(deletions)s" % d["info"]["summary"],
      "cost:", d["info"]["cost"])
'
```

Assistant messages carry `step-start` / `text` / `step-finish` parts — filter on
`type == "text"` or you will pick up control parts.

`opencode export --sanitize` redacts sensitive content; use it before showing an export to
anyone but the user.

## Multi-turn delegation

Follow up without losing the subagent's context:

```bash
opencode run --auto --session "$SID" "Now add a regression test for that fix" < /dev/null
opencode run --auto --continue "And update the CHANGELOG" < /dev/null   # last session
opencode run --auto --session "$SID" --fork "Try a different approach instead" < /dev/null
```

`--fork` branches from the session so you can explore an alternative without destroying the
original thread. Chain `--session` when the follow-up depends on prior context; start fresh when
it does not — a clean context is usually cheaper and sharper.

## Restricting tools

For a subagent that must not write, create a scoped agent once:

```bash
opencode agent create --path .opencode/agent --mode subagent \
  --description "Read-only reviewer" --tools read,grep,glob,webfetch
```

Then delegate to it. Passing all required flags keeps `agent create` non-interactive:

```bash
opencode run --agent reviewer "Audit src/ for injection risks" < /dev/null
opencode agent list
```

This is safer than `--auto` on a general agent when the task is analysis, not modification.

## Batching many delegations

Each `opencode run` boots a server and MCP connections. For several calls, start one server and
attach to it:

```bash
opencode serve --port 4096 &          # background
opencode run --attach http://localhost:4096 --auto "task one" < /dev/null
opencode run --attach http://localhost:4096 --auto "task two" < /dev/null
```

Kill the server when done. If it's password-protected, set `OPENCODE_SERVER_PASSWORD` and pass
`-u`/`-p`. Independent tasks can also just be launched as parallel background bash calls.

## Reporting back

You are responsible for the subagent's output, so don't launder it. Read what came back,
verify the claims that matter (run the tests yourself, check the diff), and tell the user what
actually happened — including when the subagent failed or did something you had to undo. An
empty or banner-only stdout means it produced nothing; say so rather than implying success.

## Gotchas

| Symptom | Cause |
|---|---|
| **Hangs forever, zero output** | **Missing `< /dev/null` — opencode is blocked reading stdin** |
| Hangs, but a UI would have drawn | Bare `opencode`/`tui`/`web`/`attach`/`-i` launched an interactive UI |
| Hangs partway through a task | Permission prompt with nobody to answer — needs `--auto` |
| Output has `\e[0m` junk | ANSI is emitted even when piped — strip it, or use `--format json` |
| First lines aren't the answer | `> agent · model` banner occupies lines 1–3 of default format |
| Prompt mangled | Unquoted prompt got word-split and glob-expanded |
| `auth` vs `providers` confusion | Command is `providers` in 1.18.11; `auth` is an alias |
| Subagent edited the wrong repo | `--dir` not set; it used the current cwd |
| Flags don't match this doc | Version drift — `opencode run --help` is the source of truth |

### Diagnosing a hang

The stdin hang and a genuinely slow model call look identical from outside. Tell them apart:

```bash
opencode run --print-logs --log-level DEBUG "…" < /dev/null
```

Stderr ends at `message=init` and goes silent ⇒ it never started the turn. A healthy run logs
`booting location services` immediately after `init`. Confirm with `lsof -p <pid> | grep TCP` —
**no TCP connection means it never called the model**, so the problem is local, not the provider.
opencode also writes to `~/.local/share/opencode/log/opencode.log`.

Note that `serve`, `models`, `session list`, `export`, and `mcp list` keep working normally while
`run` hangs — so "other opencode commands work" does *not* rule out the stdin hang.

For the full command surface, see [reference.md](reference.md).
