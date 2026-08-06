# Repository Guidelines

## Project Structure & Module Organization

This repository is a personal Node.js command-line toolset. Source code lives in `tools/<tool-name>/cli.js`, with one self-contained CLI per tool:

- `tools/upwork/` for Upwork OAuth, job search, job lookup, and browser open commands.
- `tools/gmail/` for Gmail OAuth, labels, message reads, attachments, and sending mail.
- `tools/outlook/` for Outlook OAuth through Microsoft Graph, folders, message reads, attachments, moves, and sending mail.
- `tools/gcalendar/` for Google Calendar OAuth, calendar listing, event reads, and event CRUD.
- `tools/gdrive/` for Google Drive OAuth, file search, metadata reads, downloads, exports, uploads, file management, and browser open commands.
- `tools/onedrive/` for OneDrive OAuth through Microsoft Graph, account reads, file search, metadata reads, downloads, uploads, file management, and browser open commands.
- `tools/notion/` for Notion OAuth, page/database/block/comment/user reads, writes, resolution, and database summaries.
- `tools/freelancer/` for Freelancer.com OAuth, project search, project lookup, user/profile/review reads, bid and milestone reads, bid submission/retraction, contests, messages, notifications, and browser open commands.
- `tools/linguaslice/` for turning spoken MP3 recordings into sentence clips and a local interactive listening player.
- `tools/linkedin/` for LinkedIn Jobs search URL generation and browser open commands. It must not scrape LinkedIn or automate a logged-in account.
- `tools/playwright/` for Playwright-backed browser automation, including persistent Chromium/system-Chrome sessions, one-shot page reads, screenshots, tab switching, iframe targeting, page/form inspection, custom control handling, form filling, submit-result checks, and JSON flow execution.

Each tool has a local `README.md`. Root-level command examples are documented in `COMMANDS.md`. Build and verification helpers live in `scripts/`. Generated output goes to `dist/`; downloaded files and browser artifacts commonly go to `downloads/`. Do not edit generated or downloaded output by hand.

Assistant-specific files are owned by their matching CLI. Claude Code should update only Claude-related files such as `CLAUDE.md` and `.claude/`. Codex CLI should update only Codex-related files such as `AGENTS.md`, `.agents/`, and `.codex/`. Do not update another assistant CLI's files unless the user explicitly asks for that specific file.

## Build, Test, and Development Commands

Run commands from the repository root.

- `npm install` installs package metadata.
- `npm run verify` runs the full validation pipeline: type check, lint, and build.
- `npm test` is an alias for `npm run verify`.
- `npm run type-check` runs `node --check` against CLI entrypoints.
- `npm run lint` enforces local style rules.
- `npm run build` copies `tools/` into `dist/` and creates `dist/package.json`.

Tool examples: `node tools/gmail/cli.js help`, `node tools/upwork/cli.js search "node.js" --limit 20`, `node tools/freelancer/cli.js search "java spring boot" --limit 20`, `node tools/linkedin/cli.js search "ai agent" --location "Auckland, New Zealand"`, `node tools/linguaslice/cli.js create lesson.mp3`, `node tools/gcalendar/cli.js events --calendar primary`, `node tools/gdrive/cli.js files --query "proposal" --limit 20`, and `node tools/onedrive/cli.js files --query "proposal" --limit 20`.

## Coding Style & Naming Conventions

Use CommonJS, `"use strict";`, 2-space indentation, double quotes, and semicolons. Avoid tabs and trailing whitespace. CLI files should keep executable shebangs. Use `camelCase` for functions and variables, `UPPER_SNAKE_CASE` for constants, and lowercase dash-separated names for tool directories.

Prefer built-in Node APIs. Most tools intentionally avoid runtime npm dependencies, including for HTTP, OAuth callback handling, `.env` parsing, option parsing, MIME helpers, and browser launching. The Playwright CLI is the deliberate exception and uses the `playwright` package. Keep each CLI self-contained rather than introducing shared runtime modules unless the duplication becomes meaningfully hard to maintain.

Existing CLIs use a repeated local pattern: load the root `.env`, parse positional args plus `--key value` flags, use native `fetch`, and open browser URLs through platform-specific commands. OAuth-based tools run a local callback server, store tokens in `tools/<tool>/.token.json`, and refresh access tokens when needed.

## Testing Guidelines

There is no separate unit test framework. Treat `npm run verify` as the required pre-commit test. When adding or changing a CLI, run the specific command manually with `help` or a non-destructive read operation where possible, then run `npm test`. For OAuth or browser-opening commands, prefer help, URL-printing, or read-only API commands for routine verification unless credentials and side effects are explicitly intended.

## Commit & Pull Request Guidelines

Recent history uses short, imperative summaries such as `add gmail support` and `minor adjustment`. Keep commits focused and describe the behavior changed. Pull requests should include a concise description, commands run for verification, linked issue or context when applicable, and screenshots only if browser-visible behavior changes.

## Security & Configuration Tips

Store private credentials only in the root `.env`, using `.env.example` as the template. Do not commit `.env`, OAuth token files such as `tools/<tool>/.token.json`, `dist/`, or `downloads/`. Build output excludes token files; keep that behavior intact when changing `scripts/build.js`.
