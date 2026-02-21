# Contributing to BlueLens

Thanks for your interest in contributing! This document covers everything you need to know to submit a quality contribution.

> **Security vulnerability?** Do **not** open an issue. Follow the process in [SECURITY.md](SECURITY.md) instead.

---

## Table of contents

- [Getting started](#getting-started)
- [Project structure](#project-structure)
- [Architecture notes](#architecture-notes)
- [What to contribute](#what-to-contribute)
- [Making changes](#making-changes)
- [Pull request format](#pull-request-format)
- [Security requirements for contributors](#security-requirements-for-contributors)
- [Code style](#code-style)
- [Commit messages](#commit-messages)
- [Questions?](#questions)

---

## Getting started

### Prerequisites

- Node.js 18+
- A Chromium-based browser (Chrome, Edge, Brave) — required for the File System Access API

### Setup

```bash
git clone https://github.com/Nathanf22/BlueLens.git
cd BlueLens
npm install
npm run dev        # http://localhost:3000
```

### AI features (optional)

AI-powered features require an API key. Copy `.env.example` to `.env` and fill it in:

```bash
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
```

Or configure it directly in the **AI Settings** panel inside the app. Supported providers:

| Provider | Where to get a key |
|----------|--------------------|
| Google Gemini | [Google AI Studio](https://aistudio.google.com/) |
| OpenAI | [OpenAI Platform](https://platform.openai.com/) |
| Anthropic | API key + CORS proxy (browser restriction) |

---

## Project structure

```
BlueLens/
  App.tsx                  # Root orchestrator — composes hooks, passes props down
  types.ts                 # All TypeScript types and interfaces
  constants.ts             # App-wide constants
  components/              # React components (stateless — props only)
  hooks/                   # Custom hooks (state + logic)
  services/                # Pure services (no React dependency)
  public/                  # Static assets served by Vite
```

There is no `src/` directory — source files live at the project root. The path alias `@/*` maps to the root.

---

## Architecture notes

- **No state library** — state lives in custom hooks in `hooks/`, composed in `App.tsx`, and passed via props.
- **No backend** — everything runs client-side. Data persists to `localStorage` and `IndexedDB`.
- **No test runner or linter** — contributions must build cleanly with `npm run build`.
- **Props-only components** — components receive data via props and emit events via callbacks. No context providers.

---

## What to contribute

Check the [PRD](PRD) and [PROGRESS.md](PROGRESS.md) for the full roadmap. Areas where contributions are most welcome:

| Area | Details |
|------|---------|
| **Phase 4 — Polish** | Semantic search, version history, diagram templates, PDF/HTML export |
| **Bug fixes** | Anything listed in [KNOWN_ISSUES.md](KNOWN_ISSUES.md) or reproducible bugs |
| **Performance** | Force graph rendering, Mermaid re-render cycles |
| **Tests** | No test framework exists yet — adding one with initial coverage is valuable |
| **Documentation** | Improving this file, README, or inline code documentation |

If you are not sure whether your idea fits the project, open an issue first to discuss it before writing code.

---

## Making changes

1. **Fork** the repository and clone your fork:
   ```bash
   git clone https://github.com/your-username/BlueLens.git
   cd BlueLens
   ```

2. **Create a branch** from `main` with a descriptive name:
   ```bash
   git checkout -b feat/diagram-png-export
   git checkout -b fix/crash-on-workspace-delete
   ```

3. **Make your changes.** Keep them focused — one feature or fix per PR.

4. **Verify the build** before opening a PR:
   ```bash
   npm run build
   ```

5. **Run a security self-review** (see [Security requirements](#security-requirements-for-contributors) below).

6. **Commit** with a clear message following [Conventional Commits](#commit-messages).

7. **Push** your branch and open a Pull Request against `main`.

---

## Pull request format

Every PR must use the [PR template](.github/PULL_REQUEST_TEMPLATE.md) provided. It will be loaded automatically when you open a PR on GitHub.

A good PR includes:

- **A clear description** of what changed and why
- **A link to the related issue** (if one exists) using `Closes #123`
- **Step-by-step testing instructions** so the reviewer can verify the change
- **A completed security checklist** (see the template)
- **Screenshots or a recording** for any UI changes
- **One concern per PR** — avoid bundling unrelated changes

PRs that are missing the security checklist or cannot be built with `npm run build` will be closed without review.

---

## Security requirements for contributors

All contributions must meet these requirements before being merged.

### Never commit secrets

- Never hardcode API keys, tokens, passwords, or any credentials in source code
- Never commit `.env` — it is in `.gitignore` for a reason
- Use `.env.example` to document required environment variables (with placeholder values only)
- If you accidentally commit a secret, rotate it immediately and notify the maintainer

### Dependency safety

- Justify any new dependency in your PR description
- Run `npm audit` before opening a PR and resolve any high or critical findings:
  ```bash
  npm audit
  npm audit fix   # for auto-fixable issues
  ```
- Prefer well-maintained packages with a history of security patches

### XSS and injection prevention

- Never pass untrusted user input to `dangerouslySetInnerHTML`, `eval()`, `Function()`, or `innerHTML`
- The existing `dangerouslySetInnerHTML` uses in `Preview.tsx` and `CodeGraphVisualizer.tsx` are intentional — they only render SVG output from the Mermaid.js library, never from user input or external APIs. New uses of this pattern require explicit justification in the PR
- Sanitize or validate all data that crosses a trust boundary (user input, external API responses, imported files)

### localStorage and IndexedDB

- Do not store sensitive data (API keys, tokens) in `localStorage` in plaintext
- API keys entered in the AI Settings panel are already encrypted via AES-GCM before being written to IndexedDB — follow this pattern for any new credential storage

### Reporting a vulnerability found during contribution

If you discover a security vulnerability while working on a contribution, do not include a fix in your PR without first notifying the maintainer privately. Follow the process in [SECURITY.md](SECURITY.md).

---

## Code style

- Follow existing patterns in the codebase — consistency matters more than personal preference
- Prefer editing existing files over creating new ones
- Keep components stateless — logic belongs in hooks or services
- TypeScript strict mode — avoid `any`; use `unknown` + type narrowing when the type is truly uncertain
- No comments for self-evident code; comments are for non-obvious decisions or trade-offs

---

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Use for |
|--------|---------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `refactor:` | Code restructuring with no behavior change |
| `docs:` | Documentation only |
| `chore:` | Build, deps, config |
| `perf:` | Performance improvement |
| `security:` | Security fix (non-vulnerability — for vulnerability fixes, follow SECURITY.md) |

Examples:
```
feat: add PNG export for diagrams
fix: prevent crash when deleting the active workspace
docs: clarify File System Access API browser requirement
security: redact API key from error log messages
```

---

## Questions?

Open an issue on GitHub or reach out to the maintainer:

**Nathan Kamokoue** — [LinkedIn](https://www.linkedin.com/in/nathan-kamokoue-1289121b8/) / [X](https://x.com/KamokoueNathan)
