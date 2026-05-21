# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                  # Install dependencies (none at runtime; dev tooling only)
npm run verify               # Full check: type-check + lint + build (aliased as npm test)
npm run type-check           # Syntax check all CLI entrypoints via node --check
npm run lint                 # Style checks (use strict, no tabs, no trailing whitespace, shebang)
npm run build                # Copy tools/ to dist/, generate dist/package.json

# Run individual tools
node tools/upwork/cli.js help
node tools/gmail/cli.js help
node tools/gcalendar/cli.js help
node tools/gdrive/cli.js help
node tools/notion/cli.js help
node tools/freelancer/cli.js help
node tools/linkedin/cli.js help
```

## Architecture

Zero npm runtime dependencies — everything uses built-in Node APIs (native `fetch`, `http`, `fs`, `path`, `child_process`). Each tool is a single self-contained `tools/<tool-name>/cli.js` file; no shared library code between tools.

### Tools

- **tools/upwork/** — Upwork job search via GraphQL API (`https://api.upwork.com/graphql`). Commands: `auth`, `search [keywords] [--limit] [--offset] [--sort recency|relevance] [--verified-only]`, `job <id>`, `open <id>`.
- **tools/gmail/** — Gmail via REST API. Commands: `auth`, `labels`, `list [--query] [--limit] [--label]`, `read <id>`, `move <id> --from <label> --to <label> [--create-label]`, `attachments <id>`, `download-attachments <id> [--out]`, `send --to --subject --body [--attach]`.
- **tools/gcalendar/** — Google Calendar CRUD via REST API. Commands: `auth`, `calendars`, `events [--calendar] [--limit]`, `add-event --summary --start --end`, `update-event <id>`, `delete-event <id>`.
- **tools/gdrive/** — Google Drive access via REST API. Commands: `auth`, `files [--query] [--text] [--folder] [--limit]`, `get <id>`, `download <id> [--out] [--mime]`, `open <id>`, `mkdir`, `upload`, `update-content`, `update`, `rename`, `move`, `copy`, `trash`, `untrash`, `delete`.
- **tools/notion/** — Notion workspace via REST API (`https://api.notion.com/v1`, version `2022-06-28`). Commands: `auth`, `search [--query] [--filter page|database] [--limit]`, `resolve-page <name>`, `resolve-database <name>`, `get-page <id-or-url>`, `get-database <id-or-url>`, `create-page --database-id --properties-json`, `update-page <id-or-url> --properties-json`, `archive-page <id-or-url>`, `query-database <id-or-url> [--filter-json] [--sorts-json] [--limit]`, `query-database-summary --summary-json`, `create-database`, `update-database`, `list-block-children`, `append-block-children --children-json`, `update-block --body-json`, `archive-block`, `create-comment --page-id --text`, `list-comments`, `list-users`, `get-user <id>`.
- **tools/linkedin/** — Builds LinkedIn Jobs search URLs and opens in browser; **no API calls or scraping**. Commands: `search [keywords] [--location] [--date day|week|month] [--workplace remote|hybrid|onsite] [--type fulltime|parttime|contract|...] [--experience entry|associate|mid|senior|director|executive] [--start] [--open]`, `developer`.
- **tools/freelancer/** — Freelancer.com via REST API. Commands: `auth [--client-credentials]`, `search "keywords" [--limit] [--offset] [--full-description] [--user-details]`, `project <id>`, `open <id-or-url>`, `profile`, `user <id>`, `reviews <projectId>`, `bids [projectId] [--limit]`, `bid <projectId> --amount --period --description`, `contests ["keywords"] [--limit]`, `messages [--limit]`, `notifications [--limit] [--unread-only]`, `milestones <projectId>`.

### Environment variables (see `.env.example`)

| Tool | Required | Optional |
|------|----------|----------|
| Upwork | `UPWORK_CLIENT_ID`, `UPWORK_CLIENT_SECRET` | `UPWORK_CALLBACK_URL` |
| Gmail | `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` | `GMAIL_CALLBACK_URL`, `GMAIL_SCOPES` |
| GCalendar | `GCALENDAR_CLIENT_ID`, `GCALENDAR_CLIENT_SECRET` | `GCALENDAR_CALLBACK_URL`, `GCALENDAR_SCOPES` |
| GDrive | `GDRIVE_CLIENT_ID`, `GDRIVE_CLIENT_SECRET` | `GDRIVE_CALLBACK_URL`, `GDRIVE_SCOPES` |
| Notion | `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET` | `NOTION_CALLBACK_URL`, `NOTION_VERSION` |
| Freelancer | `FREELANCER_CLIENT_ID`, `FREELANCER_CLIENT_SECRET` | `FREELANCER_CALLBACK_URL`, `FREELANCER_SCOPE`, `FREELANCER_ADVANCED_SCOPES`, `FREELANCER_BASE_URL` |
| LinkedIn | — | — |

All tools share the same default callback: `http://localhost:3000/callback`.

### Shared patterns (implemented independently per file, not via a shared library)

- **`.env` loading**: custom `key=value` parser reading root `.env`; skips comments; only sets keys not already in `process.env`.
- **CLI parsing**: custom `parseOptions()` — positional args in `_` array, `--key value` flags; some tools allow repeated flags as arrays.
- **OAuth2 flow**: local `http.createServer()` callback server; token stored in `tools/<tool>/.token.json` (mode `0o600`) with `access_token`, `refresh_token`, `expires_at` (ms), and account metadata.
- **Token refresh**: checks `expires_at` before every API call; refreshes automatically; `expires_in` is pre-reduced by 60 s to avoid edge cases.
- **HTTP**: native `fetch` with `Authorization: Bearer <token>`; no external HTTP libraries.
- **Browser open**: `open` (macOS) / `start` (Windows) / `xdg-open` (Linux).

### Auth differences between tools

- **Freelancer** uses a non-standard `Freelancer-OAuth-V1: <token>` header instead of `Bearer`. It also supports `--client-credentials` (app-only grant, no user interaction, tokens don't expire).
- **Notion** token exchange uses HTTP Basic Auth (`Authorization: Basic base64(clientId:clientSecret)`). It accepts page/database IDs as raw UUIDs (with or without hyphens) or full Notion URLs — IDs are normalized internally.
- **Gmail** always requests `access_type=offline` and `prompt=consent` to guarantee a refresh token.
- **GDrive** uses full Drive scope by default so write commands work. Permanent delete requires `--yes`.
- **LinkedIn** has no auth at all — it only constructs URLs with hardcoded LinkedIn query-parameter codes for filter values (e.g., `r86400` for "past day", `2` for "remote").

### Scripts

- `scripts/type-check.js` — runs `node --check` on every `tools/*/cli.js`
- `scripts/lint.js` — enforces `"use strict";`, no tabs, no trailing whitespace, shebang on CLI files
- `scripts/build.js` — copies `tools/` to `dist/`, excludes `.token.json`, generates minimal `dist/package.json`

### Adding a new tool

Place it under `tools/<tool-name>/cli.js`, add `tools/<tool-name>/README.md`, register the bin entry in `package.json`, and add usage examples to `COMMANDS.md`. Follow the shared patterns above; duplicate the implementation rather than extracting a shared library.

## Coding Style

CommonJS (`require`/`module.exports`), `"use strict";`, 2-space indentation, double quotes, semicolons. `camelCase` for functions/variables, `UPPER_SNAKE_CASE` for constants, lowercase dash-separated directory names.
