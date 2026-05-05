# Repository Guidelines

## Project Structure & Module Organization

This repository is a small Node.js command-line toolset. Run commands from the repository root.

- `tools/upwork/cli.js`: Upwork CLI implementation and executable entrypoint.
- `tools/gmail/cli.js`: Gmail CLI implementation and executable entrypoint.
- `tools/<tool>/README.md`: Tool-specific setup and usage notes.
- `COMMANDS.md`: Root-level command reference for installed tools.
- `.env.example`: Required environment variable template.
- `package.json`: npm scripts, package metadata, and CLI bin mapping.

There is no dedicated `src/`, `test/`, or assets directory yet. Add new tools under `tools/<tool-name>/` and include a local `README.md` when setup or usage is not obvious.

## Build, Test, and Development Commands

- `npm install`: Install dependencies from `package-lock.json`.
- `npm run verify`: Run `node --check` against all CLI entrypoints.
- `npm test`: Alias for `npm run verify`.
- `npm run upwork:auth`: Start the Upwork OAuth flow and save a local token.
- `npm run upwork:search -- "node.js openai api" --limit 20`: Search Upwork jobs.
- `npm run gmail:auth`: Start the Gmail OAuth flow and save a local token.
- `npm run gmail:list -- --query "is:unread" --limit 10`: Search Gmail messages.
- `node tools/upwork/cli.js help`: Show supported CLI commands.

## Coding Style & Naming Conventions

Use CommonJS (`require`, `module.exports` if exports are added) and keep scripts compatible with direct Node execution. Follow the existing style in `tools/upwork/cli.js`: two-space indentation, semicolons, double quotes, `"use strict";`, and small focused functions. Use `camelCase` for functions and variables, `UPPER_SNAKE_CASE` for constants, and lowercase dash-separated directory names under `tools/`.

## Testing Guidelines

Current coverage is syntax verification only. Before committing, run:

```bash
npm test
```

For behavior changes, prefer adding focused tests before broad rewrites. If a test framework is introduced, place tests near the tool they cover or under a root `test/` directory, and document the new command in `package.json` and `COMMANDS.md`.

## Commit & Pull Request Guidelines

The current history uses short imperative commits, for example `init` and `adjust .gitignore`. Keep commit messages concise and action-oriented. Pull requests should include a brief summary, verification steps run, and any setup or credential changes. Include terminal output or screenshots only when they clarify CLI behavior.

## Security & Configuration Tips

Do not commit secrets or local tokens. Keep credentials in the root `.env` file based on `.env.example`. OAuth tokens are stored in each tool directory as `.token.json`, for example `tools/upwork/.token.json` and `tools/gmail/.token.json`; these should remain ignored. Local agent directories such as `.codex/` and `.claude/` are also ignored.
