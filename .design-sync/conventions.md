# Eventual design system — conventions

Eventual is an expense-splitting app. Its look is the "paper desk": a pale canvas, white paper cards, a black pill as the primary action, and a few physical accents (tape blue, note yellow, badge purple, cardboard warm). Components are shadcn/Radix primitives styled with **Tailwind utility classes over CSS variables**. Read `guidelines/DESIGN.md` for the full design rationale.

## Setup
- No provider or root wrapper is needed: load `styles.css` (it already imports the component CSS, tokens and fonts) and render components directly.
- Fonts (Instrument Sans, Inter, Inter Tight, Caveat) load from Google Fonts via `styles.css`; without network the page falls back to system sans.
- Dark mode is the `dark` class on any ancestor (e.g. `<html class="dark">`); the same tokens re-resolve. Light is default.
- Page canvas: `bg-background text-foreground`. Cards sit on it as `bg-card` (white paper).

## Styling idiom — semantic tokens, never raw hex
Use Tailwind classes built on the token names below (all exist in the compiled stylesheet), or `var(--token)` in inline styles.
| Family | Names |
|---|---|
| Surfaces | `bg-background`, `bg-card`, `bg-popover`, `bg-muted`, `bg-secondary`, `bg-accent` |
| Text | `text-foreground`, `text-muted-foreground`, `text-primary-foreground`, `text-card-foreground` |
| Action | `bg-primary` (black pill), `bg-destructive` |
| Money | `text-positive` (owed to you, green), `text-negative` (you owe, red), `text-warning` |
| Paper accents | `bg-tape` (blue), `bg-note` + `text-note-ink` (sticky-note yellow), `bg-badge` (purple), `bg-cardboard` (warm) — small and deliberate, never large fills |
| Lines/focus | `border-border`, `ring-ring` |
| Type | `font-sans` (default), `font-display` (headlines), `font-hand` (handwritten note accents only) |
| Shape/depth | `rounded-md/lg/xl/full`, `shadow-xs/sm/md/lg` (soft, warm shadows) |
Layout glue: standard Tailwind `flex`, `grid`, `gap-1…12`, `p-/px-/py-/m-` 0–12, `text-xs…2xl`. Radius base is `--radius` (0.875rem). Utilities outside these families may not be compiled — fall back to inline `style` with the `var(--*)` tokens (`--background`, `--card`, `--paper`, `--positive`, `--negative`, `--accent-blue`, `--note`, `--border`, `--radius`).

## Conventions
- Money: render with `Amount` (`minor` = integer minor units, `currency` default INR, `tone="signed"` colours by sign). Never hand-format amounts.
- Primary actions are `Button` (default variant = black pill); secondary `variant="secondary"`/`"outline"`; quiet `"ghost"`; irreversible `"destructive"`.
- Forms: `FieldGroup` > `Field` > `FieldLabel` + `Input`/`Select`/`Textarea` + `FieldDescription`/`FieldError`. Mark invalid with `aria-invalid` on the control.
- People: `MemberAvatar` for a member (initials, stable colour from `seed`); `Avatar`/`AvatarGroup` for generic stacks.
- Compound components must be used with their parts (`Card` + `CardHeader/CardTitle/CardContent`, `Tabs` + `TabsList/TabsTrigger/TabsContent`, `Dialog` + `DialogContent/DialogHeader/DialogTitle`). Each component's `.prompt.md` lists its parts.
- Icons come from `lucide-react` (not bundled in `window.Eventual`); keep them 16px inside buttons.

## Example
```jsx
const { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Button, Amount, MemberAvatar } = window.Eventual;
<div className="bg-background p-6">
  <Card style={{ maxWidth: 380 }}>
    <CardHeader>
      <CardTitle>Goa trip</CardTitle>
      <CardDescription>4 members</CardDescription>
    </CardHeader>
    <CardContent className="flex items-center justify-between">
      <div className="flex items-center gap-2"><MemberAvatar name="Aarav Kapoor" seed="a" /><span className="text-sm">Aarav</span></div>
      <Amount minor={342000} tone="signed" />
    </CardContent>
    <CardFooter className="gap-2"><Button size="sm">Settle up</Button><Button size="sm" variant="ghost">Remind</Button></CardFooter>
  </Card>
</div>
```
