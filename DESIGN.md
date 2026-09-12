# How Eventual is designed

Last updated: 2026-09-11

The tokens and shared classes described here live in `src/styles.css`. Change them there, not per component.

## Overview

Eventual is a shared-expense app. It uses a scrapbook-like editorial style: a pale canvas, oversized headlines, white paper cards, sticky-note accents, and soft shadows that make each screen feel arranged by hand. It stays polished, but tilted cards, handwritten notes, tape strips and a few loud accent colours give it a handmade edge.

The mood changes by chapter. Everyday screens (dashboard, groups, expenses, settings) stay airy and neutral so black type, balances and paper cards lead. Story sections on the landing page switch to almost-black or deep blue backgrounds, where white copy, paper sheets and bright badges tell the story. Across both, the type stays large, the primary button stays a dark pill, and the rhythm comes from generous space rather than decoration.

## Colors

The colour system is small and based on roles. Light screens use a cool off-white canvas with white paper cards on top. Story stages switch to almost-black or saturated blue. Accents show up as tape, badges, sticky notes and small props. Black is the main action colour, used for buttons and the wordmark. Blue is never the main button fill. It is an accent for tape, underlines, focus rings and small markers. Yellow, purple and warm paper tones appear only as physical-looking props and notes.

| token           | css variable         | hex       | role                | use                                                                  |
| --------------- | -------------------- | --------- | ------------------- | -------------------------------------------------------------------- |
| `action`        | `--primary`          | `#000000` | Primary action fill | Dark pill buttons, the wordmark, and the strongest text              |
| `ink`           | `--foreground`       | `#000000` | Main text           | Headlines, nav text and body copy on pale screens                    |
| `muted-ink`     | `--muted-foreground` | `#46403F` | Secondary text      | Dates, meta lines, descriptions and quieter labels                   |
| `canvas`        | `--background`       | `#F3F6F9` | Page wash           | The flat background behind every screen                              |
| `paper`         | `--card`             | `#FFFFFF` | Card surface        | Cards, dialogs and popovers sitting above the canvas                 |
| `muted`         | `--muted`            | `#E8ECF0` | Inset surface       | Tab tracks, segmented controls and inset wells                       |
| `border`        | `--border`           | `#DBD8D6` | Hairline border     | Faint dividers and calm card outlines                                |
| `input`         | `--input`            | `#BBB8B7` | Control border      | Input and select outlines, which need more contrast than card edges  |
| `stage-dark`    | `--stage-dark`       | `#161616` | Dark story stage    | Gridded story panels on the landing page                             |
| `stage-blue`    | `--stage-blue`       | `#0A4169` | Blue story stage    | Letter-style scenes with a tilted paper sheet                        |
| `accent-blue`   | `--accent-blue`      | `#3A9EDD` | Tape accent         | Tape strips, link underlines, focus rings and kicker markers         |
| `accent-yellow` | `--accent-yellow`    | `#D6C12D` | Note accent         | Sticky notes (`--note` is the lighter paper fill) and text selection |
| `accent-purple` | `--accent-purple`    | `#5253A4` | Badge accent        | Coin-like badges and circular markers                                |
| `accent-warm`   | `--accent-warm`      | `#C59E7C` | Cardboard accent    | Cardboard tones and taped paper edges                                |

### Status colours

Balances need a diverging pair, and these colours are for that job only. Never use them as decoration.

| token      | light     | dark      | use                                           |
| ---------- | --------- | --------- | --------------------------------------------- |
| `positive` | `#1F6B45` | `#6FCB95` | Money owed to you, settled states             |
| `negative` | `#B42318` | `#F2806F` | Money you owe, destructive actions            |
| `warning`  | `#7A5B00` | `#E3CF4A` | Reserved for the locked-expense banner only   |

Every balance also carries a sign and a text label, so its meaning never depends on colour alone.

### Dark mode

Dark mode is almost black and colour-neutral, so long screens stay calm: canvas `#111111`, paper `#1A1A1A`, and near-white text. The action pill inverts to a paper-white fill with black text, so it is still the strongest object on the screen.

## Typography

Inter Tight carries the big statements, Inter handles interface text, and Caveat appears only for handwritten accents. Hierarchy comes from size, line length and tight tracking rather than many weights. That keeps the system coherent from the hero down to nav links, balance cards and note labels.

| token             | family      |      size | weight | leading | tracking | use                                                   |
| ----------------- | ----------- | --------: | -----: | ------: | -------: | ----------------------------------------------------- |
| `hero-display`    | Inter Tight |    4.5rem |    500 |     0.9 |  -0.04em | Landing hero statement and the dashboard running total |
| `section-display` | Inter Tight |    3.5rem |    500 |    0.95 | -0.035em | Page titles and story-stage leads                     |
| `card-heading`    | Inter Tight |    1.5rem |    500 |    1.05 |  -0.02em | Group names, card titles and short subheads           |
| `body`            | Inter       |      1rem |    400 |     1.5 |      0em | Paragraphs and general copy                           |
| `body-small`      | Inter       |  0.875rem |    400 |     1.4 |      0em | Dates, meta text, kickers and supporting details      |
| `navigation`      | Inter       | 0.9375rem |    400 |     1.4 |      0em | Header links and utility actions                      |
| `button`          | Inter       | 0.9375rem |    500 |     1.2 |      0em | Pill buttons and short calls to action                |
| `handwritten`     | Caveat      |   1.25rem |    400 |     1.1 |   0.01em | Sticky notes, scribbles and paper annotations         |

The `.display-title` class sets the display family, weight 500 and tight tracking, and it overrides weight utilities on purpose. Keep display type compact and direct. Supporting copy should feel softer and wider, and deliberately quieter rather than just smaller. Money always uses `.tabular` so columns don't jitter.

## Layout

Layouts are centred and spacious. The landing hero works like a poster, and later sections read like edited magazine spreads. The first view is a vertical stack: headline, a collage (a sample group balance card with paper props around it), then a short supporting paragraph.

Signed-in screens follow the same logic at a calmer volume. A slim header runs across the top, the page title sits above the content, and cards drop into even columns with a steady gap. Groups on the dashboard use the article-card pattern: quiet paper surfaces and rounded corners, with the balance doing the visual work and the meta line set small underneath.

Story sections are more theatrical. The dark stage uses a gridded field with a central panel and lets stickers, notes and payment badges orbit it. The blue stage uses a tilted white sheet, a banknote-like cutout and a sticky note for a looser, asymmetric composition. In both, the main message stays centred or near-centred so the props support it instead of competing.

FAQ-style content goes back to a calm, table-like rhythm: a centred question, a row of paper cards, and one pill button below. Gutters stay generous, section breaks are obvious, and nothing sits inside tightly nested frames.

## Visual language

Eventual looks assembled from paper, tape and printed scraps. Props are slightly oversized and often tilted, which adds handmade energy without hurting clarity. Shadows are soft and directional, like objects on a desk rather than software widgets with heavy elevation. The collage style is strongest on the landing hero and the story stages.

The background matters as much as the props. The canvas is flat and matte, with no gradients, glow or glass blur. Dark and blue stages set a denser mood and make white paper pop. Cards have rounded corners, but not so soft that the structure disappears.

Handwritten marks add personality in a controlled way. They belong on sticky notes, quick annotations and small flourishes next to the formal type. Used sparingly, they make the app feel human. Used often, they weaken the editorial hierarchy. Plan for at most one handwritten element per screen.

## Shared classes

| class                 | what it is                                                                             |
| --------------------- | -------------------------------------------------------------------------------------- |
| `.page-wrap`          | Centred 1120px content column                                                          |
| `.display-title`      | Inter Tight display type (weight 500, tight tracking)                                  |
| `.island-shell`       | Primary white paper panel with a soft desk shadow                                      |
| `.feature-card`       | Clickable paper card that lifts and tilts slightly on hover                            |
| `.island-kicker`      | Small muted label with a strip of blue tape in front of it                             |
| `.segmented`          | Pill-shaped tab track for split methods and group tabs                                 |
| `.handwritten`        | Caveat annotation text                                                                 |
| `.sticky-note`        | Yellow note prop with Caveat text and a slight rotation                                |
| `.tape`               | Translucent blue tape strip; position it absolutely on a relative parent               |
| `.paper-sheet`        | Tilted white sheet for story stages and collages                                       |
| `.story-stage`        | Almost-black gridded chapter background with white text                               |
| `.story-stage-deep`   | Blue chapter background with white text                                                |
| `.rise-in`            | Entrance animation, turned off when the user prefers reduced motion                    |

Every `[data-slot='button']` is a pill, and the default variant gets a light shadow. Default tab lists and their triggers are pills too.

## Components

### Masthead

- **Anatomy:** Wordmark on the left. Actions on the right: theme toggle, a quiet login or ghost action, and a dark pill.
- **Typography:** Inter at navigation size. The wordmark uses the display family in ink.
- **Surface:** Sits on the canvas, with a hairline divider under it on signed-in screens.
- **Shape:** The main action is a pill, not a rectangle.
- **Composition:** Keep it slim and secondary to the page title. It frames the page; it doesn't compete with it.

### Hero collage (landing)

- **Anatomy:** Large centred headline, supporting copy, a central sample balance card, and paper props around it (sticky note, tape, a coin badge).
- **Typography:** Inter Tight for the headline, Inter for the supporting lines, Caveat on the note.
- **Surface:** Flat canvas.
- **Shape:** The card and props have rounded edges and soft, realistic shadows. Props are tilted a few degrees.
- **Composition:** The headline dominates the top half and the collage is one anchored centrepiece. Props should read as objects orbiting it.

### Balance summary

- **Anatomy:** A kicker, a display-size running total in positive or negative colour, a one-line welcome, and two small paper tiles for "owed to you" and "you owe".
- **Surface:** `.island-shell` on the canvas.
- **Composition:** The number is the hero of the screen. Keep the tiles quiet.

### Group card grid

- **Anatomy:** Role badge, group name, signed balance, and a small status line.
- **Typography:** Inter Tight for the group name, Inter for the meta line, tabular figures for the amount.
- **Surface:** `.feature-card` paper on the canvas.
- **Shape:** Moderate rounding, faint borders and generous padding.
- **Composition:** Even columns, consistent heights and generous gaps, so the grid feels calm rather than busy.

### Story panel (landing)

- **Anatomy:** Full-width stage background, a central paper sheet or card, supporting notes, and a few floating stickers.
- **Typography:** Inter Tight for the statement, Inter for body text, Caveat for notes.
- **Surface:** `.story-stage` or `.story-stage-deep`.
- **Shape:** The central paper is slightly tilted and the props have cutout-like edges.
- **Composition:** Keep the message centred and let the objects around it create movement. Playful but controlled.

### FAQ grid

- **Anatomy:** Centred question heading, a row of paper cards, and one pill action below.
- **Surface:** Canvas with white cards.
- **Composition:** Cards align evenly, and the heading stays readable before the grid starts.

### Primary action

- **Anatomy:** Black pill with white text and a soft shadow. In dark mode it's a paper-white pill with black text.
- **Typography:** The Inter button style.
- **Shape:** Fully rounded ends with compact horizontal padding.
- **States:** At rest the button is strong but not glossy, with a flat fill and light shadow. The focus ring is accent blue.

### Handwritten note

- **Anatomy:** A short Caveat line on a sticky note or paper scrap.
- **Surface:** Note yellow, warm paper, or a white card.
- **Shape:** Slight rotation, soft edges and casual placement.
- **Composition:** A detail, never a headline. It adds personality while the main type stays in charge.

## Responsive behavior

On narrow screens, keep the hierarchy before changing the layout. The headline comes first, then the collage or balance card, and supporting copy stays readable instead of shrinking into a dense block. Card grids go from three columns to two, then one, with the same card style and small meta labels.

Story stages shrink by removing surrounding props before shrinking the main paper or panel. Notes can move closer to the edges, but the centred message must stay clear. Header labels can collapse to icons, but the wordmark and the primary action should still feel like the same product.

## Practical implementation guidance

### Preserve

- The centred, poster-like hero.
- The split between neutral app screens and saturated story stages.
- A consistent dark pill button everywhere.
- Paper-like objects for personality, not glossy interface chrome.
- Inter Tight for big statements and Inter for utility text.

### Avoid

- Brand colours beyond the palette above.
- Glassmorphism, backdrop blur, shiny gradients and neon effects.
- Small-radius card systems that lose the paper feel.
- Mixing many font families or weights to fake hierarchy.
- Blue as the main button fill; it stays an accent.
- Status colours (positive, negative, warning) used as decoration.

### Accessibility

- Keep strong contrast on the dark and blue stages, especially for white text.
- The dark pill must be readable on every pale section, and the inverted pill on every dark one.
- Focus rings (accent blue) must stay visible on the canvas, on paper, and on the stages.
- Never rely on colour alone for meaning in balances, badges, notes or icons.
- Keep line lengths short enough that centred headings stay readable on small screens.
- Tilts, lifts and entrance animations turn off when the user prefers reduced motion.

## Scope note

This guide covers the landing page, the auth screens, the signed-in app shell, the dashboard, group and expense screens, buttons, cards, and handwritten notes. It doesn't specify exact breakpoints, loading and error states, or the full footer. Measurements are practical targets, not pixel specs.
