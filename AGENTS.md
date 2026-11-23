# AGENTS.md — Efficient Coding Agent Guidelines

## Primary Objective

Minimize unnecessary network uploads, context consumption, file reads, and tool output while preserving full implementation quality, architectural understanding, correctness, and problem-solving ability.

**Efficiency must never come at the expense of implementation quality.**

The agent should work with the smallest sufficient amount of information, not the smallest possible amount of information.

---

## 1. Repository Exploration

Before implementing a task:

1. Identify the relevant modules and entry points.
2. Inspect the existing project structure only as needed.
3. Identify direct dependencies and integrations of the affected functionality.
4. Read relevant models, schemas, services, repositories, routers, permissions, and frontend components when applicable.
5. Expand the inspection scope only when an actual dependency requires it.

### Rules

- Never recursively read the entire repository just to understand a task.
- Never dump entire directories into the context.
- Never inspect unrelated modules without a concrete reason.
- Prefer targeted file searches over reading many files.
- Use filenames, symbols, imports, and references to identify relevant code.
- Do not assume a file is irrelevant solely because its name does not mention the feature.
- Inspect shared infrastructure when the implementation depends on it.
- Do not repeat repository exploration if the necessary information is already available and still reliable in the current context.

## 2. File Reading Efficiency

Prefer the smallest useful inspection operation.

Use this priority:

1. Search for a specific class, function, endpoint, or symbol.
2. Read the relevant function or class.
3. Inspect surrounding code when necessary.
4. Read the complete file when the implementation requires understanding its full structure.

### Avoid

- Printing entire files unnecessarily.
- Reading the same file repeatedly without a reason.
- Reopening unchanged files simply to refresh context.
- Dumping large JSON, configuration, or generated files.
- Reading generated code when the original source is available.
- Inspecting dependency internals unless a specific issue requires it.

### Important

Never truncate information that is necessary to understand:

- Authorization and permission boundaries.
- Database relationships and constraints.
- Transaction handling.
- Error handling.
- API contracts.
- Shared business logic.
- Cross-module dependencies.

## 3. Repository Exclusions

Do not recursively inspect, index, or read dependency directories, generated assets, build artifacts, caches, or unrelated binary files.

Typical exclusions:

- `node_modules/`
- `.venv/`
- `venv/`
- `__pycache__/`
- `.pytest_cache/`
- `.mypy_cache/`
- `.ruff_cache/`
- `dist/`
- `build/`
- `coverage/`
- `.next/`
- `.turbo/`
- `vendor/`
- `*.pyc`
- `*.min.js`
- `*.map`
- Generated lock-independent artifacts.
- Large binary files and media assets.

Use existing `.gitignore` and tool-specific ignore configurations where supported.

Do not modify ignore rules simply to hide relevant source files.

### Sensitive Files

Never unnecessarily read or transmit:

- `.env`
- Private keys.
- Credentials.
- Access tokens.
- Database dumps containing real user data.
- Local secrets and authentication files.

Use `.env.example`, configuration schemas, or documented variable names when sufficient.

If a sensitive value is genuinely needed, request an appropriate secure method rather than exposing it in context.

## 4. Search Efficiency

Use targeted searches.

Prefer searching for:

- Exact class names.
- Function names.
- Route paths.
- Model relationships.
- Imports.
- Specific error messages.
- References to affected components.

Avoid:

- Searching every file for generic words.
- Repeating identical searches.
- Searching dependency directories.
- Producing enormous search results.

Always restrict searches to relevant source directories when possible.

When results are large, narrow the query rather than sending the entire output into context.

## 5. Context Management

Preserve useful context while minimizing repeated information.

- Reuse established architecture knowledge.
- Do not repeatedly explain the entire project architecture.
- Do not resend unchanged code when a reference to its location is sufficient within the available context.
- Avoid repeating previous tool outputs.
- Keep task summaries concise and focused on decisions, dependencies, and unfinished work.
- When context compaction is necessary, preserve important implementation details rather than generic conversation history.

### Preserve These Details

When relevant, retain:

- Current implementation status.
- Important file locations.
- Architectural decisions.
- Database and API contracts.
- Permission requirements.
- Known dependencies.
- Unresolved implementation issues.
- Changes already made.

Never discard critical context merely to reduce token consumption.

## 6. Terminal Output Optimization

Commands should produce only the information needed.

Prefer:

- Targeted `grep` or `rg` searches.
- Specific `sed` ranges.
- Concise Git diffs.
- Summary output.
- Targeted error messages.
- Restricted directory listings.

Avoid:

- Printing entire repositories.
- Printing complete database schemas unnecessarily.
- Dumping complete logs.
- Running commands that generate enormous output without filtering.
- Repeatedly printing unchanged command results.
- Verbose debug output when unnecessary.

For commands with potentially large output, filter or limit results.

However, never suppress errors or warnings that could affect implementation correctness.

## 7. Git Efficiency and Safety

Before modifying files:

- Check the relevant Git state.
- Identify existing user modifications that could be affected.
- Inspect relevant existing changes before editing overlapping files.

During implementation:

- Keep modifications limited to the requested scope.
- Avoid unnecessary formatting changes.
- Avoid rewriting entire files when localized modifications are sufficient.
- Do not overwrite unrelated user changes.
- Do not generate large diffs for small changes.

When reviewing modifications, inspect the actual diff rather than printing all modified files.

## 8. Implementation Quality Must Be Preserved

Bandwidth optimization does not justify incomplete engineering.

Always inspect the necessary dependencies to understand:

- Existing architectural conventions.
- Authentication and authorization.
- Database constraints and migrations.
- Data validation.
- Transaction boundaries.
- Error handling.
- API compatibility.
- Frontend/backend integration.
- Existing component and service patterns.

Do not:

- Guess implementation details when source inspection is necessary.
- Invent existing functions, models, or APIs.
- Skip permission checks.
- Ignore database relationships.
- Introduce duplicate business logic.
- Make assumptions about shared components without inspecting them when relevant.
- Sacrifice maintainability for fewer file reads.

## 9. Agent Tool Usage

Use tools efficiently.

- Avoid unnecessary browser screenshots.
- Do not repeatedly inspect the same page or state.
- Avoid transmitting large images when a targeted textual inspection is sufficient.
- Prefer structured command output over large raw outputs.
- Do not run redundant commands.
- Avoid unnecessary external requests.
- Do not repeatedly request the same information from the user.

Use browser interaction, screenshots, or visual inspection whenever they are genuinely necessary for the task. Do not replace necessary visual verification with assumptions.

## 10. Task Completion

At completion, provide a concise implementation report.

Include:

1. Files created.
2. Files modified.
3. Main implementation changes.
4. Important architectural decisions.
5. Database or API changes, if applicable.
6. Any unresolved issues.
7. Verification actually performed.

Do not include complete file contents or enormous command outputs in the report.

Never claim that something was verified unless it was actually verified.

---

## Final Operating Principle

Use targeted exploration, efficient context management, minimal necessary tool output, and localized code modifications.

**Do not optimize by knowing less about the code. Optimize by eliminating redundant information and unnecessary transfers while retaining everything required to implement the task correctly.**

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