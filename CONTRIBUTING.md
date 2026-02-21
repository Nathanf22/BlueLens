# Contributing to BlueLens

Thanks for your interest in contributing! BlueLens is a living architecture diagram platform built with React and TypeScript.

## Getting Started

```bash
git clone https://github.com/Nathanf22/BlueLens.git
cd BlueLens
npm install
npm run dev        # http://localhost:3000
```

### Prerequisites

- Node.js 18+
- A Chromium-based browser (required for File System Access API)

### AI Features (optional)

AI-powered features (chat, code scanning, flow generation, smart grouping) require an API key from one of:

- Google Gemini
- OpenAI
- Anthropic (requires a CORS proxy)

Copy `.env.example` to `.env` and add your key, or configure via the AI Settings panel in the app.

## Project Structure

```
BlueLens/
  App.tsx                  # Root orchestrator — composes hooks, passes props
  types.ts                 # All TypeScript types and interfaces
  components/              # React components (no state — props only)
  hooks/                   # Custom hooks (state + logic)
  services/                # Pure services (no React dependency)
```

There is no `src/` directory — source files live at the project root. The path alias `@/*` maps to the root.

## Architecture Notes

- **No state library** — state is managed via custom hooks in `hooks/`, composed in `App.tsx`, and drilled via props.
- **No backend** — everything runs client-side. Data persists to `localStorage` and `IndexedDB`.
- **No test runner or linter** — contributions should build cleanly with `npm run build`.

## Making Changes

1. Fork the repo and create a branch from `main`:
   ```bash
   git checkout -b feature/your-feature
   ```

2. Make your changes. Keep them focused — one feature or fix per PR.

3. Verify the build:
   ```bash
   npm run build
   ```

4. Commit with a clear message:
   ```
   feat: Add diagram export to PNG
   fix: Prevent crash when deleting active workspace
   ```

5. Open a Pull Request against `main`.

## What to Contribute

Check the [PRD](PRD) and [PROGRESS.md](PROGRESS.md) for the roadmap. Some areas where help is welcome:

- **Phase 4 — Collaboration**: Real-time editing with Yjs/CRDT
- **Phase 5 — Polish**: Semantic search, version history, templates, PDF export
- **Bug fixes**: Anything that doesn't work as expected
- **Performance**: The force graph and Mermaid rendering can always be faster
- **Tests**: There are none yet — adding a test framework and initial coverage would be valuable

## Code Style

- Follow existing patterns in the codebase
- Prefer editing existing files over creating new ones
- Keep components stateless — logic belongs in hooks or services
- TypeScript strict mode — no `any` unless unavoidable

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `refactor:` — code restructuring (no behavior change)
- `docs:` — documentation only
- `chore:` — build, deps, config

## Security

Please read [SECURITY.md](SECURITY.md) before reporting vulnerabilities. Do **not** open public issues for security bugs.

## Questions?

Open an issue on GitHub or reach out to the maintainer:

**Nathan Kamokoue** — [LinkedIn](https://www.linkedin.com/in/nathan-kamokoue-1289121b8/) / [X](https://x.com/KamokoueNathan)
