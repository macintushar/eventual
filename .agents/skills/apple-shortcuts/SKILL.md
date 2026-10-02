---
name: apple-shortcuts
description: Create and edit Eventual Apple Shortcuts using the repository's TypeScript workflow builders and macOS signing commands.
---

# Eventual Apple Shortcuts

Work from the repository root. The working generators are `scripts/build-shortcut.ts` and `scripts/build-shortcut-ai.ts`; shared plist helpers live in `scripts/shortcut-lib.ts`. This checkout does not include the Python `shortcuts_compiler` library or its action catalog. The other documents in this skill folder are historical reference material from an external compiler project, not a runnable local toolchain.

## Build and verify

- Install project dependencies with `bun install` when needed.
- Generate workflows without signing by importing `buildShortcut(origin)` or `buildAiShortcut(origin)`. Importing these modules has no signing side effects.
- Run `bun test scripts` to verify emitted control flow, references, and representative input paths.
- On macOS, run `bun run shortcut:build https://your-eventual-url` and `bun run shortcut:build-ai https://your-eventual-url`. These commands convert to binary plist with `plutil`, sign with the `shortcuts` CLI, and write `public/eventual.shortcut` and `public/eventual-ai.shortcut`.
- Import the signed outputs into Apple Shortcuts to verify platform behavior. Generator tests do not replace this device check.

## Editing workflows

Use `createBuilder`, `text`, `variable`, and `dictionary` from `shortcut-lib.ts` to preserve UUIDs and input attachments. If, Otherwise, and End If all use `is.workflow.actions.conditional` with modes 0, 1, and 2 and a shared grouping identifier. Use explicit inputs for Set Variable.

Preserve import question indexes: input is action 0, API key is action 1, origin is action 2. Keep keys blank in committed artifacts. Manual input may prompt for an amount; automated SMS input must notify and exit when it cannot identify a completed expense. Persist the chosen group after every selection path, including an AI guess.

Check action parameters against working local examples or an exported shortcut from the target Apple Shortcuts version. Add representative workflow tests when changing parsing or branches, and regenerate the signed artifacts after generator changes.
