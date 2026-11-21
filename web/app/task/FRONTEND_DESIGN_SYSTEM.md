# Tasks Frontend Design System

This document extracts the **actual** design conventions observed in the existing Calendar module and shared frontend foundations. Tasks must follow these conventions and reuse existing theme tokens/components; do **not** invent new design tokens.

## 1. Global design foundations (real)

### 1.1 Theme tokens (`web/app/src/styles/theme.css`)
- **Palette/system:** Warm Mist (light), warm neutrals with soft 3D shadows. Dark `.dark` token block exists but is not toggled by the app.
- **Typography:** `--font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`; line-height `1.5`; antialiased rendering.
- **Core legacy tokens:** surfaces `--color-bg #F2F0EB`, `--color-surface #FFFFFF`, `--color-surface-muted #F7F5F1`, `--color-surface-inset #EAE7E0`; text `--color-text #242321`, muted/subtle `#77736C`; borders/inputs `#E5E1D9`; accent `--color-accent #2563eb` / hover `#1d4ed8`; danger `#b42318` (+ soft/border variants).
- **Spacing scale:** `--space-1..10` = 4/8/12/16/20/24/32/40px.
- **Radii:** `--radius-sm 8px`, `--radius-md 10px`, `--radius-lg 14px`; shadcn base `--radius: 10px` (`rounded-lg=10px`, `md=8px`, `sm=6px` via Tailwind config mapping).
- **Elevation/focus:** raised/hover/floating/pressed/inset shadows (`--surface-shadow-*`, `--shadow-card`, `--shadow-button`), focus rings `--ring-accent` and `--ring-danger`, transition `--transition: 140ms ease`.
- **shadcn HSL tokens:** background/foreground/card/popover/primary/secondary/muted/accent/destructive/border/input/ring + sidebar token set mapped in `tailwind.config.js`.
- **App geometry:** `--header-height: 60px`, sidebar widths `--app-sidebar-width 248px`, `--app-sidebar-width-icon 48px`.

### 1.2 Global CSS primitives (`web/app/src/index.css`)
- Tailwind base sets `border-border` on all elements and `bg-background text-foreground` on body.
- Resets: `box-sizing: border-box`, zero body margin, zero margins on `h1/h2/h3/p`, inherited link/button/input font/color behaviors.
- Shared button classes: `.button-primary` and `.button-secondary` (32px height, inline-flex centered, 12.5px/500, `--radius-sm`, padding `0 var(--space-3)`, tokenized colors/borders/shadows, hover/active/focus-visible states, reduced-motion disables transitions). Prefer shadcn `Button` in new UI; these classes exist as shared primitives.

## 2. Calendar design conventions (reference to match)

### 2.1 Page layout and container
- Root: `.calendar-page` (flex column, `gap: var(--space-4)`, `width/min-width/max-width: 100%/0/100%`, `padding-inline: var(--space-4)`).
- Height model: `height: calc(100dvh - var(--header-height) - var(--space-8) - var(--space-10))`, `min-height: 520px` on desktop; collapses to `height: auto` on small screens.
- Module background: page-level warm neutral (`--cal-page-bg: #F2F0EB`) with rounded corners on container context in CSS; main surface is a raised white card.
- Responsive padding/height: <=1024px `padding-inline: var(--space-3)` and adjusted calc height; <=640px `padding-inline: var(--space-2)`, `gap: var(--space-3)`.

### 2.2 Toolbar/header layout
- Two-level toolbar in `CalendarToolbar.jsx`:
  - **Primary row:** `flex flex-wrap items-center gap-2` with module title `text-[15px] font-semibold tracking-[-0.01em]`, calendar selector, and right-aligned primary action `ml-auto` (`Button size="sm" class="h-8 gap-1.5"` with `Plus` icon size 15).
  - **Navigation row:** `flex flex-wrap items-center gap-2 sm:gap-3` with grouped nav controls, flexible/truncating range label (`min-w-0 flex-1 truncate text-sm font-semibold tracking-[-0.01em] text-foreground`, `aria-live="polite"`), and right-aligned view selector.
- Control groups (`.cal-control-group`): raised pill/group surfaces with border, radius `--cal-radius-control (10px)`, tactile hover/active/focus-visible states; internal icon buttons typically `size-8`, text buttons `h-8`.
- View selector: segmented buttons in group (`h-7`, `px-2.5`, `text-[12.5px] font-medium`, active uses `variant="default"` / pressed state).

### 2.3 Surfaces, borders, radii, elevation
- Calendar surface (`.calendar-surface`): `position: relative; flex: 1; min-height: 0; overflow: hidden; background: white/raised; border: 1px solid var(--cal-line #E5E1D9); border-radius: 14px; box-shadow: var(--cal-shadow-raised)`.
- Overlays (loading/error/empty): absolute inset, centered card `max-w-[320px] rounded-[var(--radius-lg)] border bg-card p-5 shadow-sm`; optional passthrough mode keeps grid interactive.
- Calendar-specific radii: surface 14px, controls 10px, events 9px (Soft 3D). General UI follows theme radii 8/10/14.
- Borders/lines: warm neutral line colors (`#E5E1D9`, soft/strong variants) and subtle inset/raised shadow layering.

### 2.4 Typography and icon sizing (observed)
- Module/page titles: `text-[15px] font-semibold tracking-[-0.01em]` (toolbar), dialog/sheet titles `text-[15px]` (DialogShell) or larger in detail (`text-lg font-semibold` in EventDetailPanel title).
- Labels/section headings: `text-[13px] font-medium|semibold`.
- Body/meta: common sizes `text-[12.5px]`, `text-[13px]`, `text-sm`, with muted meta in `text-muted-foreground` / `text-[11px]-[12px]`.
- Uppercase micro-labels: e.g. `text-[11px] font-medium uppercase tracking-[0.06em|0.08em]`.
- Icons (Lucide): inline action icons commonly `size={13|14|15|16}` depending on control density (toolbar/create 15, nav 16, small buttons 13-14).

### 2.5 Forms and dialogs
- `DialogShell` (`src/components/shared/DialogShell.jsx`): shadcn Dialog with `max-h-[calc(100dvh-2rem)]`, responsive width, scrollable body, optional sticky footer, header border/bottom and title style; `wide` => larger max width (`sm:max-w-[720px]`).
- `FormField`/`fieldInputClass`: inputs `h-11 rounded-[var(--radius-md)] px-3 text-base md:text-[15px]`; invalid state uses destructive border/ring; hint/error via `FieldMessage` (`text-[12.5px]`, destructive/alert semantics for errors).
- Textareas: rounded `--radius-md`, comfortable min heights (e.g. 60-84px), `text-base md:text-[15px]`.
- Buttons in dialogs/footers: commonly `h-9`; destructive/outline/ghost variants as appropriate.
- Portal-rendered overlays (`.cal-dialog`, `.cal-sheet`) carry explicit border/shadow/input focus styling because they render outside `.calendar-page` token scope.

### 2.6 Menus, selectors, and controls
- Dropdowns/menus: shadcn `DropdownMenu` with labeled sections, separators, compact item text/icons (`size 14`), selection indicators (check), badges for metadata.
- Selects: shadcn `Select` triggers/content (`h-8` in dense contexts like reminders, default in forms).
- Badges: shadcn `Badge` variants (`secondary`, `outline`) with compact sizing (`text-[10px]-[11px]`, small padding) for status/meta chips.
- Checkboxes/radios: shadcn `Checkbox` and custom `RadioOption` card pattern (`rounded-[var(--radius-md)] border p-3`, checked/hover states, native input behavior preserved).

### 2.7 States (loading, empty, error)
- **Loading:** `LoadingState` shows status text (`text-[12.5px] text-muted-foreground`) + skeleton lines; calendar also uses inline spinner patterns (`LoaderCircle animate-spin motion-reduce:animate-none`).
- **Empty:** `EmptyState` supports optional icon mark, title `text-[13.5px] font-semibold`, muted description, optional action slot; calendar overlays use role/status and passthrough when non-blocking.
- **Error:** `ErrorState` uses destructive `Alert` with optional title/message and retry button (`h-8` outline destructive style); form/action errors use `FormError` (compact destructive alert).
- **Busy/disabled:** async actions set `busy/saving` flags to disable controls, show progress labels (`Saving…`, `Loading…`), and prevent duplicate submits/dismissals where relevant.

### 2.8 Responsive behavior
- Wrap-friendly flex rows (`flex-wrap`) in toolbars and control clusters.
- Calendar reduces paddings/heights and allows page/surface scrolling on narrow screens (<=640px: surface gets viewport-based height and horizontal scroll support for dense grids where needed).
- Touch/readability adjustments: smaller paddings/fonts in dense calendar grids, preserved key information, controls remain reachable.
- Reduced motion respected (`prefers-reduced-motion: reduce` disables transitions/animations in calendar scope and shared button classes).

### 2.9 Monochrome/event accent note
- Interface chrome is largely monochrome/warm-neutral; semantic color is restrained (destructive red, accent blue for existing primary actions/tokens).
- Calendar event category colors are a domain-specific exception defined in `calendar/categories.js` (pastel bg, stronger accent, dark text) and rendered via CSS vars; Tasks should not copy calendar category palette unless task domain requires analogous semantics and uses existing token-safe styling patterns.

## 3. Guidance for Tasks UI (apply these conventions)
- Use `DialogShell` for create/edit flows, `ConfirmDialog` for destructive/scope confirmations, and `Sheet` (right side, like `EventDetailPanel`) for task details if a side panel is used.
- Use `FormField`, `FormError`, `fieldInputClass`, and shared `LoadingState/EmptyState/ErrorState` for consistent form and state presentation.
- Match toolbar density/typography: 15px semibold titles, 13px labels, 12-13px meta, 32px/36px-ish control heights (`h-8`/`h-9` common), Lucide icons 14-16.
- Prefer Tailwind utilities + existing theme/shadcn tokens and CSS variables; any Tasks-specific CSS must be module-scoped (inside `web/app/task/`) and only for cases not covered well by existing primitives.
- Preserve responsive behavior, keyboard/focus-visible states, and accessible labels/names per AGENT.md.
