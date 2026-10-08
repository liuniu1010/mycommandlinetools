# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Assistant File Ownership

Assistant-specific files are owned by their matching CLI. Claude Code should update only Claude-related files such as `CLAUDE.md` and `.claude/`. Codex CLI should update only Codex-related files such as `AGENTS.md`, `.agents/`, and `.codex/`. Do not update another assistant CLI's files unless the user explicitly asks for that specific file.

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
node tools/outlook/cli.js help
node tools/gcalendar/cli.js help
node tools/gdrive/cli.js help
node tools/onedrive/cli.js help
node tools/notion/cli.js help
node tools/freelancer/cli.js help
node tools/linkedin/cli.js help
node tools/playwright/cli.js help
node tools/linguaslice/cli.js help
```

## Architecture

Minimal npm runtime dependencies — tools use built-in Node APIs (native `fetch`, `http`, `fs`, `path`, `child_process`) except Playwright, which requires the `playwright` npm package for Chromium automation. LinguaSlice additionally needs FFmpeg and FFprobe on `PATH`. Each tool is a single self-contained `tools/<tool-name>/cli.js` file; no shared library code between tools.

### Tools

- **tools/upwork/** — Upwork job search via GraphQL API (`https://api.upwork.com/graphql`). Commands: `auth`, `search [keywords] [--limit] [--offset] [--sort recency|relevance] [--verified-only]`, `job <id>`, `open <id>`.
- **tools/gmail/** — Gmail via REST API. Commands: `auth`, `labels`, `list [--query] [--limit] [--label]`, `read <id>`, `move <id> --from <label> --to <label> [--create-label]`, `attachments <id>`, `download-attachments <id> [--out]`, `send --to --subject --body [--attach]`, `reply <id> --body [--to] [--attach]`.
- **tools/outlook/** — Outlook mail via Microsoft Graph. Commands (`labels` lists mail folders; no `reply` yet): `auth`, `labels`, `list [--query] [--limit] [--label]`, `read <id>`, `move <id> --from <folder> --to <folder> [--create-label]`, `attachments <id>`, `download-attachments <id> [--out]`, `send --to --subject --body [--attach]`.
- **tools/gcalendar/** — Google Calendar CRUD via REST API. Commands: `auth`, `calendars`, `events [--calendar] [--limit]`, `add-event --summary --start --end`, `update-event <id>`, `delete-event <id>`.
- **tools/gdrive/** — Google Drive access via REST API. Commands: `auth`, `files [--query] [--text] [--folder] [--limit]`, `get <id>`, `download <id> [--out] [--mime]`, `open <id>`, `mkdir`, `upload`, `update-content`, `update`, `rename`, `move`, `copy`, `trash`, `untrash`, `delete`.
- **tools/onedrive/** — OneDrive via Microsoft Graph. Commands: `auth`, `account`, `files [--query] [--folder] [--limit] [--orderBy]`, `get <id>`, `download <id> [--out]`, `open <id>`, `mkdir --name [--parent]`, `upload <file> [--name] [--parent]`, `update-content <id> <file>`, `update <id> --name` (alias `rename`), `move <id> --to <folderId>`, `copy <id>`, `trash <id>`, `delete <id> --yes`.
- **tools/notion/** — Notion workspace via REST API (`https://api.notion.com/v1`, version `2022-06-28`). Commands: `auth`, `search [--query] [--filter page|database] [--limit]`, `resolve-page <name>`, `resolve-database <name>`, `get-page <id-or-url>`, `get-database <id-or-url>`, `create-page --database-id --properties-json`, `update-page <id-or-url> --properties-json`, `archive-page <id-or-url>`, `query-database <id-or-url> [--filter-json] [--sorts-json] [--limit]`, `query-database-summary --summary-json`, `create-database`, `update-database`, `list-block-children`, `append-block-children --children-json`, `update-block --body-json`, `archive-block`, `create-comment --page-id --text`, `list-comments`, `list-users`, `get-user <id>`.
- **tools/linkedin/** — LinkedIn OAuth profile reads and member post publishing via the LinkedIn API, plus Jobs search URL building (job search makes **no API calls and no scraping**). Commands: `auth`, `auth-status`, `profile`, `post-text --text`, `post-link --text --url [--title] [--description]`, `post-image --text --file [--alt]`, `search [keywords] [--location] [--date day|week|month] [--workplace remote|hybrid|onsite] [--type full-time|part-time|contract|...] [--experience entry|associate|mid|senior|director|executive] [--open]`, `developer`.
- **tools/freelancer/** — Freelancer.com via REST API. Commands: `auth [--client-credentials]`, `search "keywords" [--limit] [--offset] [--sort] [--full-description] [--user-details] [--location-details]`, `project <id>`, `open <id-or-url>`, `profile`, `profile-skills <list|add|remove|set> [jobId ...]`, `user <id-or-username>`, `reviews <projectId>`, `bids [projectId] [--limit]`, `bid <projectId> --amount --period --description [--milestone-percentage]`, `retract-bid <bidId>`, `contests ["keywords"] [--limit]`, `services [serviceId ...] [--owner]`, `service-orders`, `portfolios [userId]`, `messages [--limit] [--project]`, `project-messages <projectId>`, `send-message (--thread <id> | --to <userId> [--project <id>]) --message [--yes]`, `notifications [--limit] [--unread-only]`, `milestones <projectId>`, `milestone-requests --bid <bidId>`, `request-milestone <projectId> --bid --amount --description`. Project owners are redacted by the API (`owner_id` is always null), and there is no notifications endpoint: `notifications` summarises message threads and own bids.
- **tools/linguaslice/** — Turns a spoken MP3 into per-sentence clips and a local HTML player, using OpenAI transcription with word timestamps and FFmpeg for cutting. Commands: `create <input.mp3> [--output] [--language] [--padding] [--bitrate] [--transcript-json] [--force]`.
- **tools/playwright/** — Chromium browser automation via Playwright. Commands: `session start [--name] [--headless] [--viewport] [--profile] [--user-agent] [--cdp-url]`, `session status [--name]`, `session stop [--name] [--force]`, `goto <url> [--session]`, `click [locator] [--session]`, `fill [locator] --value <text> [--session]`, `press <key> [--session]`, `select [locator] --value <v> [--session]`, `check/uncheck [locator] [--session]`, `wait [locator] [--state] [--load-state] [--session]`, `text [locator] [--session|--url]`, `html [locator] [--session|--url]`, `links [locator] [--session|--url] [--limit]`, `exists [locator] [--session|--url]`, `screenshot --out <file> [--session|--url] [--full-page]`, `snapshot [--session] [--json]`, `tabs [--session]`, `tab use --index <n> [--session]`, `flow <file.json> [--session]`, `download <url> --out <file>`, `scroll`, `click-index --index <n>`, `select-combobox --option <text>`, `fill-textareas --values <json-or-file>`, `submit-check`, and page-inspection helpers `controls`, `inspect-form`, `page-state`, `read-keylines --pattern <regex>`. Locators: `--selector`, `--text`, `--role --name`, `--label`, `--placeholder`, `--title`, `--test-id`, `--nth`, `--frame`, `--within`, `--visible`.

### Environment variables (see `.env.example`)

| Tool | Required | Optional |
|------|----------|----------|
| Upwork | `UPWORK_CLIENT_ID`, `UPWORK_CLIENT_SECRET` | `UPWORK_CALLBACK_URL` |
| Gmail | `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` | `GMAIL_CALLBACK_URL`, `GMAIL_SCOPES` |
| GCalendar | `GCALENDAR_CLIENT_ID`, `GCALENDAR_CLIENT_SECRET` | `GCALENDAR_CALLBACK_URL`, `GCALENDAR_SCOPES` |
| GDrive | `GDRIVE_CLIENT_ID`, `GDRIVE_CLIENT_SECRET` | `GDRIVE_CALLBACK_URL`, `GDRIVE_SCOPES` |
| Outlook | `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET` | `OUTLOOK_CALLBACK_URL`, `OUTLOOK_SCOPES` |
| OneDrive | `ONEDRIVE_CLIENT_ID`, `ONEDRIVE_CLIENT_SECRET` | `ONEDRIVE_CALLBACK_URL`, `ONEDRIVE_SCOPES` |
| Notion | `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET` | `NOTION_CALLBACK_URL`, `NOTION_VERSION` |
| Freelancer | `FREELANCER_CLIENT_ID`, `FREELANCER_CLIENT_SECRET` | `FREELANCER_CALLBACK_URL`, `FREELANCER_SCOPE`, `FREELANCER_ADVANCED_SCOPES`, `FREELANCER_BASE_URL` |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` (not needed for `search`) | `LINKEDIN_CALLBACK_URL`, `LINKEDIN_SCOPES`, `LINKEDIN_API_VERSION` |
| LinguaSlice | `OPENAI_API_KEY` (unless `--transcript-json`) | — |
| Playwright | — | — |

All OAuth tools share the same default callback: `http://localhost:3000/callback`.

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
- **Outlook** and **OneDrive** use the Microsoft identity platform (`login.microsoftonline.com/common`, v2.0 endpoints) and call Microsoft Graph. Both are typically backed by the same Azure app registration. OneDrive permanent delete requires `--yes`.
- **LinkedIn** uses OpenID Connect (`openid profile email`) plus `w_member_social` for publishing; publishing needs the Share on LinkedIn product, and every `post-*` command previews the content and asks for confirmation. `search` needs no auth: it only constructs URLs with hardcoded LinkedIn query-parameter codes for filter values (e.g., `r86400` for "past day", `2` for "remote").
- **Playwright** has no OAuth auth — it launches a Chromium browser and stores persistent browser profiles under `tools/playwright/.profiles/<name>/`. `session start --cdp-url http://127.0.0.1:9222` instead attaches to a Chrome the user already started with `--remote-debugging-port` (manual login, then CLI takeover): no profile directory is used, launch-time flags are rejected, and `session stop` only detaches. **When the user asks to open a browser, launch Chrome with the handover flags and attach — see `.claude/commands/playwright.md`** (`DISPLAY=:10.0 google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-cdp"`), because a Playwright-launched browser is blocked by Google sign-in. Session metadata (port, token, PID) is stored under `tools/playwright/.sessions/`. Do not commit these directories.

### Scripts

- `scripts/type-check.js` — runs `node --check` on every `tools/*/cli.js`
- `scripts/lint.js` — enforces `"use strict";`, no tabs, no trailing whitespace, shebang on CLI files
- `scripts/build.js` — copies `tools/` to `dist/`, excludes `.token.json`, generates minimal `dist/package.json`

### Adding a new tool

Place it under `tools/<tool-name>/cli.js`, add `tools/<tool-name>/README.md`, register the bin entry in `package.json`, and add usage examples to `COMMANDS.md`. Follow the shared patterns above; duplicate the implementation rather than extracting a shared library.

## Coding Style

CommonJS (`require`/`module.exports`), `"use strict";`, 2-space indentation, double quotes, semicolons. `camelCase` for functions/variables, `UPPER_SNAKE_CASE` for constants, lowercase dash-separated directory names.
