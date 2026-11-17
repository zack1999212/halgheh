# Frontend UI Development Rules

These rules apply to every new frontend feature, page, component, and UI modification in Halgheh.

## 1. Use shadcn/ui as the Default Component System

- Use the existing shadcn/ui components in `src/components/ui/`.
- Before creating a UI component, inspect the existing UI and shared component directories.
- Reuse existing components instead of implementing equivalent controls from scratch.
- Use Radix UI primitives through the existing shadcn components.
- Use Lucide React for icons.

## 2. Shared Components

- Check `src/components/shared/` before implementing common UI patterns.
- Reuse shared components such as DialogShell, ConfirmDialog, FormField, FormError, IconButton, EmptyState, ErrorState, LoadingState, and RadioOption where appropriate.
- If a genuinely reusable component is missing, consider adding it to the appropriate shared or UI directory.
- Do not create abstractions for components that have only one use case without a clear reason.

## 3. Styling Rules

- Use Tailwind CSS utility classes and the existing theme tokens.
- Follow the established monochrome Halgheh design system.
- Use existing CSS variables for colors, borders, radius, and other design tokens.
- Avoid introducing arbitrary colors, inconsistent spacing, or a separate visual design system.
- Do not introduce another component library.
- Do not install duplicate UI dependencies.

## 4. Before Adding Components or Dependencies

- Inspect `components.json`, `tailwind.config.js`, and the existing component implementations.
- Check whether the required shadcn component already exists.
- If a component is missing, follow the project's existing shadcn conventions when adding it.
- Add dependencies only when necessary and explain why they are required.

## 5. Preserve Existing Functionality

- UI migrations must not change API contracts, backend behavior, validation rules, business logic, or existing user workflows unless explicitly requested.
- Preserve responsive behavior and accessibility.
- Use proper labels, accessible names, keyboard interactions, and focus-visible states.

## 6. Completion Requirements

For every frontend task:
- Report which existing shadcn/shared components were reused.
- Report any new UI components or dependencies.
- Explain any intentional use of custom CSS or native HTML controls.
- Confirm that existing functionality was preserved.
- Run the production build.

Do not create automated tests or test files. The application will be manually verified.