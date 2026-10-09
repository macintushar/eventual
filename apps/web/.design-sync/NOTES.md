# design-sync notes (Eventual)

- App repo, not a DS package: no dist/ or Storybook. `.design-sync/` fakes a package: `package.json` (name eventual, `types` -> tsc output), `entry.ts` (generated barrel), `gen-entry.mjs` (regenerates entry + componentSrcMap), `styles.in.css` (Tailwind v4 input -> `dist/styles.css`), `tsconfig.dts.json` (tsc declaration emit -> `dist/types`).
- **Build order before the converter** (`cfg.buildCmd`): gen-entry -> tailwind CLI (`.ds-sync/node_modules/.bin/tailwindcss`, installed in .ds-sync via `npm i @tailwindcss/cli@4`) -> `tsc -p .design-sync/tsconfig.dts.json`. Note gen-entry writes `.design-sync/.cache/srcmap.json`; componentSrcMap in config.json must be refreshed from it (paths prefixed `../`) when components are added.
- Run converter with `--entry .design-sync/entry.ts --node-modules ./node_modules`.
- Scope: all `src/components/ui/*.tsx` + presentational app components (amount, balance-bar, member-avatar, brand-logo, empty-state, settings-section, code-block, google-icon). Router/query-bound components (dock, app-shell, wordmark, composer...) deliberately excluded.
- `styles.in.css` has an `@source inline(...)` safelist so utilities the app doesn't use (bg-note, bg-tape, gap-6...) are compiled for the design agent. Extend it if conventions.md names a class that grep misses in `_ds_bundle.css`.
- `guidelinesGlob` = `../DESIGN.md` (default would ship `docs/` API audits - don't).
- Render check: no playwright download; uses `playwright-core` + shim package in `.ds-sync/node_modules/playwright`, chromium from agent-browser: `DS_CHROMIUM_PATH` (path saved in `.cache/chromium-path`, version-specific; re-find under `~/.agent-browser/browsers/`).
- Fonts come from a Google Fonts `@import` in styles (FONT_REMOTE, informational).
- Previews authored for ~34 components; the other ~160 (compound sub-parts etc.) ship floor cards.

## Known render warns
- `[TOKENS_MISSING]` --available-height/--anchor-width/--available-width/--transform-origin: set at runtime by Radix/Base UI popper; expected.
- `[RENDER_BLANK]` BreadcrumbEllipsis: tiny "..." glyph, covered by Breadcrumb preview.
- `[RENDER_THIN]` GoogleIcon: svg paints, check false positive (verified in sheet).

## Re-sync risks
- Previews depend on lucide-react (EmptyState) being bundled into the preview, not in window.Eventual.
- Dialog/Tooltip previews use forced-open + cardMode single; Radix changes could break.
- Tailwind CLI version (4.3.3) vs app's vite plugin may differ slightly in output.
- Component list is regenerated from file exports; renamed/removed components need componentSrcMap refresh.
- Overlay/other compound components (Popover, DropdownMenu, Sheet, Calendar, Combobox, Command...) are floor cards - authorable later.
