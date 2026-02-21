# Security Policy

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report security issues by emailing the maintainer directly:

**Nathan Kamokoue** — contact via [LinkedIn](https://www.linkedin.com/in/nathan-kamokoue-1289121b8/)

Include in your report:
- A clear description of the vulnerability
- Steps to reproduce it
- The potential impact
- Any suggested fix (optional)

You can expect an acknowledgement within 48 hours and a resolution timeline within the week for confirmed issues.

---

## Security Considerations for Contributors and Users

### API Keys

BlueLens supports multiple LLM providers (Gemini, OpenAI, Anthropic). API keys are handled in two ways depending on context:

| Context | Storage | Risk |
|---------|---------|------|
| In-app AI Settings | Encrypted via AES-GCM + IndexedDB | Keys never leave the browser |
| `.env` file (dev/self-host) | Local file, bundled by Vite at build time | **Baked into the production bundle** |

**Critical:** If you use a `.env` file with `GEMINI_API_KEY`, that key will be inlined into the JavaScript bundle at build time. **Never deploy a production build built with a real API key in `.env`.** Use the in-app AI Settings panel instead — keys stored there are encrypted and never bundled.

The `.env` file is listed in `.gitignore`. Never commit it.

### `dangerouslySetInnerHTML` Usage

BlueLens renders Mermaid diagrams using `dangerouslySetInnerHTML` in `components/Preview.tsx` and `components/CodeGraphVisualizer.tsx`. The SVG content in both cases is produced by the Mermaid.js library from the user's own diagram code — it is never derived from untrusted external input. This is an accepted pattern for Mermaid rendering.

### localStorage / IndexedDB

All user data (diagrams, workspaces, comments, node links) is stored locally in the browser. No data is sent to any server. The exception is AI features, which send diagram content or code snippets to the configured LLM provider API.

### File System Access API

Code Integration features use the browser's File System Access API to read local files. The app requests read-only access to the directories you select. No file writes are performed outside of what the browser sandbox permits.

### Content Security Policy

BlueLens currently loads dependencies from CDNs (`cdn.tailwindcss.com`, `esm.sh`, `fonts.googleapis.com`). A strict CSP is not enforced at this time. For self-hosted deployments in sensitive environments, consider proxying these resources locally.

---

## Supported Versions

This project is in active development. Security fixes are applied to the `main` branch only.

| Version | Supported |
|---------|-----------|
| `main` | Yes |
| Older tags | No |
