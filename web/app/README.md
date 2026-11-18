# Frontend (web/app)

Vite + React app for halgheh.

All UI work follows the rules in [`AGENT.md`](../../AGENT.md): build on the
shadcn/ui components in `src/components/ui/`, reuse the shared components in
`src/components/shared/`, and style with Tailwind utilities on the theme
tokens in `src/styles/theme.css` (monochrome Halgheh design system).

Structure:

- `src/` – app entry, router (`App.jsx`), shadcn/ui components, shared components
- `auth/` – login / auth UI
- `workspace/` – workspace layout & shared pages
- `calendar/` – calendar UI
- `task/` – tasks UI
- `features/documents/` – documents UI
- `ai/` – AI settings UI
- `notifications/` – notification UI

Each feature folder contains its own components, hooks, and API calls; the
routes are wired in `src/App.jsx`.

## Setup

```bash
cd web/app
npm install
npm run dev      # http://localhost:5173
```

## Build

```bash
npm run build
```
