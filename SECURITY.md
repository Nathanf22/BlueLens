# Security Policy

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Public issues are visible to everyone, including potential attackers. Please report security issues by contacting the maintainer privately:

**Nathan Kamokoue** — [LinkedIn](https://www.linkedin.com/in/nathan-kamokoue-1289121b8/)

Include in your report:
- A clear description of the vulnerability
- Steps to reproduce it
- The potential impact
- Any suggested fix (optional)

You will receive an acknowledgement within 48 hours and a resolution timeline within the week for confirmed issues. We follow responsible disclosure — we will credit you in the fix unless you prefer to remain anonymous.

---

## Security Requirements for Contributors

All contributions must pass the checklist in the [PR template](.github/PULL_REQUEST_TEMPLATE.md). Key requirements:

### No secrets in code or commits

- Never hardcode API keys, tokens, or passwords
- Never commit `.env` (it is in `.gitignore`)
- Use `.env.example` with placeholder values only
- If you accidentally commit a secret, **rotate it immediately** before doing anything else, then notify the maintainer

### Dependency hygiene

- Justify new dependencies in your PR description
- Run `npm audit` before opening a PR; resolve all high and critical findings
- Avoid packages with no recent maintenance or known unpatched CVEs

### XSS and injection

- Never pass untrusted input to `dangerouslySetInnerHTML`, `eval()`, `Function()`, or `innerHTML`
- Sanitize data at trust boundaries: user input, external API responses, imported files
- New uses of `dangerouslySetInnerHTML` require explicit justification

### Credential storage

- Never write API keys or tokens to `localStorage` in plaintext
- Follow the existing AES-GCM + IndexedDB encryption pattern for any new credential storage

### Vulnerability found during contribution

If you find a security vulnerability while working on a feature or bug fix, **do not include a fix in your PR**. Report it privately first so a coordinated fix can be prepared.

---

## Security Considerations for Users and Self-Hosters

### API Keys

BlueLens supports multiple LLM providers. API keys are handled differently depending on how you configure them:

| Method | Storage | Risk |
|--------|---------|------|
| In-app AI Settings panel | Encrypted via AES-GCM, stored in IndexedDB | Keys never leave the browser in plaintext |
| `.env` file (dev / self-host) | Bundled into JS at build time by Vite | **Baked into the production bundle — visible in source** |

**Critical for self-hosters:** If you place a real API key in `.env` and run `npm run build`, that key will be inlined into the JavaScript bundle. Anyone who can access your deployed app can extract it. Use the in-app AI Settings panel instead for any deployment.

### `dangerouslySetInnerHTML`

BlueLens uses `dangerouslySetInnerHTML` in two places:

- `components/Preview.tsx` — renders SVG produced by Mermaid.js from the user's own diagram code
- `components/CodeGraphVisualizer.tsx` — renders sequence diagram SVG produced by Mermaid.js

In both cases the content comes from Mermaid's renderer, not from user-controlled strings or external APIs. This is the standard pattern for embedding Mermaid output in React.

### localStorage and IndexedDB

All user data (diagrams, workspaces, comments, node links) is stored locally in your browser. Nothing is sent to any server, except the content you choose to send to an LLM provider (diagram code, code snippets) when using AI features.

### File System Access API

Code integration features use the browser's File System Access API to read local files. The app requests read-only access to the directories you select. No writes are made to your filesystem.

### CDN Dependencies

BlueLens loads some dependencies from CDNs at runtime (`cdn.tailwindcss.com`, `esm.sh`, `fonts.googleapis.com`). A strict Content Security Policy is not enforced. For deployments in security-sensitive environments, consider self-hosting these resources.

---

## Supported Versions

Security fixes are applied to the `main` branch only.

| Version | Supported |
|---------|-----------|
| `main` | Yes |
| Older releases | No |
