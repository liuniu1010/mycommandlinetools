---
name: personal-cli-assistant
description: Use this skill when acting as the user's personal assistant through this repository's local command-line tools for Gmail, Outlook, Google Calendar, Google Drive, OneDrive, Notion, Upwork, Freelancer.com, LinkedIn Jobs, and Playwright browser automation. It covers command selection, provider disambiguation, safety confirmation for side effects, and verification habits for this personal Node.js toolset.
---

# Personal CLI Assistant

This repository is the user's personal command-line assistant toolkit. Prefer the local CLIs in `tools/<tool>/cli.js` when the user asks to inspect or act on email, calendar, notes, freelance/job leads, or related personal data from this workspace.

Run commands from the repository root. Use `COMMANDS.md` as the primary command catalog, then read the relevant `tools/<tool>/README.md` only when more detail is needed.

## First Choices

- Gmail: `node tools/gmail/cli.js ...`
- Outlook: `node tools/outlook/cli.js ...`
- Google Calendar: `node tools/gcalendar/cli.js ...`
- Google Drive: `node tools/gdrive/cli.js ...`
- OneDrive: `node tools/onedrive/cli.js ...`
- Notion: `node tools/notion/cli.js ...`
- Upwork: `node tools/upwork/cli.js ...`
- Freelancer.com: `node tools/freelancer/cli.js ...`
- LinkedIn Jobs: `node tools/linkedin/cli.js ...`
- Playwright browser automation: `node tools/playwright/cli.js ...`

Use the local CLIs instead of external app connectors when the user is clearly working in this repo or asks to use these command-line tools.

## Ambiguity Rules

Ask a short clarification before acting when provider choice changes the account or side effects:

- Any write, mutation, send, submit, update, create, upload, move, copy, delete, archive, bid, browser-opening, or other side-effecting action in any local tool must be confirmed by the user before execution. The confirmation must name the exact operation, target account/provider when relevant, target object or path, and important payload fields. Do not infer permission from prior discussion unless the user explicitly requested that exact action in the current turn.
- Email without a provider: ask whether to use Gmail, Outlook, or both.
- Sending email: always confirm provider, sender/account if visible, recipients, subject, body, and attachments before sending unless the user already supplied all details and explicitly told you to send now.
- Calendar changes: confirm calendar, date/time with timezone, title, attendees, and whether to create/update/delete before making changes.
- Google Drive writes: always confirm the exact command intent, target file or folder, local file path when uploading or replacing content, destination folder when moving/copying, and whether delete is trash or permanent before running any write command.
- OneDrive writes: always confirm the exact command intent, target file or folder, local file path when uploading or replacing content, destination folder when moving/copying, and delete intent before running any write command.
- Notion writes or archive actions: confirm the target page/database/block and the exact intended change.
- Browser-opening commands: confirm when the user did not explicitly ask to open a browser.

For read-only requests, reasonable defaults are allowed:

- "Check my email" can mean list recent messages from both Gmail and Outlook if the user did not specify and a combined summary is useful.
- "What's on my calendar?" can use `primary` and a small limit unless the user specifies a calendar or date range.
- "Find this in Drive" can use read-only Drive search by file name or indexed content.
- "Find this in OneDrive" can use read-only OneDrive search by file name or indexed content.
- Job search requests should use read-only search/URL commands first.
- Browser inspection can use Playwright one-shot read commands first, such as
  `text --url`, `links --url`, `exists --url`, `read-keylines --url`,
  `inspect-form --url`, `page-state --url`, or `screenshot --url`.
- Multi-step browser work should use a named Playwright session. Prefer headed
  sessions when the user needs to log in, solve MFA/CAPTCHA, use a password
  manager, or manually inspect the browser.
- Prefer reusable Playwright CLI commands over ad-hoc `node -e` scripts for
  common browser tasks. Use `node -e` only for unusual one-off inspection or
  debugging that the CLI cannot express cleanly.

## Safe Command Patterns

Start with read-only commands and summarize results. Avoid dumping full raw JSON or full email bodies unless the user asks.

Email:

```bash
node tools/gmail/cli.js labels
node tools/gmail/cli.js list --query "is:unread newer_than:7d" --limit 10
node tools/gmail/cli.js read <messageId>
node tools/outlook/cli.js labels
node tools/outlook/cli.js list --label Inbox --limit 10
node tools/outlook/cli.js read <messageId>
```

Use Gmail labels for Gmail moves. Use Outlook mail folders for Outlook `labels`, `--label`, and `--create-label`.

Calendar:

```bash
node tools/gcalendar/cli.js calendars
node tools/gcalendar/cli.js events --calendar primary --limit 10
```

Google Drive:

```bash
node tools/gdrive/cli.js files --query "proposal" --limit 10
node tools/gdrive/cli.js files --text "resident visa" --limit 10
node tools/gdrive/cli.js files --folder root --limit 20
node tools/gdrive/cli.js get <fileId>
node tools/gdrive/cli.js download <fileId> --out downloads/gdrive
```

OneDrive:

```bash
node tools/onedrive/cli.js files --query "proposal" --limit 10
node tools/onedrive/cli.js files --text "resident visa" --limit 10
node tools/onedrive/cli.js files --folder root --limit 20
node tools/onedrive/cli.js files --folder root --limit 20 --orderBy lastModifiedDateTime
node tools/onedrive/cli.js get <itemId>
node tools/onedrive/cli.js download <itemId> --out downloads/onedrive
```

Use OneDrive `--orderBy` only with folder/listing requests, not search. OneDrive aliases include `me` for `account`, `read` for `get`, `create-folder` for `mkdir`, `replace` for `update-content`, `rename` for `update`, and `files`/`list`/`search` for the same file-listing command.

Notion:

```bash
node tools/notion/cli.js search --query "Projects" --filter database --limit 10
node tools/notion/cli.js resolve-page "Project brief"
node tools/notion/cli.js get-page <pageId-or-url>
node tools/notion/cli.js query-database <databaseId-or-url> --limit 20
```

Freelance and job search:

```bash
node tools/upwork/cli.js search "node.js openai api" --limit 20
node tools/upwork/cli.js job <jobId>
node tools/freelancer/cli.js search "java spring boot" --limit 20
node tools/freelancer/cli.js project <projectId>
node tools/freelancer/cli.js profile-skills list
node tools/freelancer/cli.js user <userId>
node tools/freelancer/cli.js portfolios [userId] [--limit 10]
node tools/freelancer/cli.js reviews <projectId>
node tools/freelancer/cli.js bids [projectId] [--limit 10]
node tools/freelancer/cli.js messages [--limit 10] [--project <projectId>]
node tools/freelancer/cli.js project-messages <projectId> [--limit 10]
node tools/freelancer/cli.js milestones <projectId>
node tools/freelancer/cli.js milestone-requests --bid <bidId> [--limit 10]
node tools/freelancer/cli.js contests "logo design" --limit 10
node tools/freelancer/cli.js services [--limit 10]
node tools/linkedin/cli.js search "ai agent" --location "Auckland, New Zealand"
```

LinkedIn must only generate or open LinkedIn Jobs URLs. Do not scrape LinkedIn, automate a logged-in account, or claim job results from LinkedIn unless the user provides them.

Playwright browser automation:

```bash
node tools/playwright/cli.js session start --name work --headless false
node tools/playwright/cli.js session start --name work --headless false --executable-path /usr/bin/google-chrome
node tools/playwright/cli.js goto https://example.com --session work
node tools/playwright/cli.js tabs --session work
node tools/playwright/cli.js tab use --index 1 --session work
node tools/playwright/cli.js text --selector main --session work
node tools/playwright/cli.js page-state --session work --json
node tools/playwright/cli.js read-keylines --session work --pattern "submitted|error|Connects" --context 1
node tools/playwright/cli.js controls --session work --pattern "submit|apply|proposal" --json
node tools/playwright/cli.js inspect-form --session work --json
node tools/playwright/cli.js click --role button --name "Sign in" --session work
node tools/playwright/cli.js fill --label Email --value user@example.com --session work
node tools/playwright/cli.js click --selector ".card" --nth 0 --frame iframe --session work
node tools/playwright/cli.js select-combobox --index 44 --option "Never" --session work
node tools/playwright/cli.js fill-textareas --values downloads/playwright/answers.json --session work
node tools/playwright/cli.js submit-check --role button --name "Submit proposal" --session work
node tools/playwright/cli.js snapshot --session work --json
node tools/playwright/cli.js session stop --name work
node tools/playwright/cli.js text --url https://example.com --selector main
node tools/playwright/cli.js read-keylines --url https://example.com --pattern "Example"
node tools/playwright/cli.js screenshot --url https://example.com --out downloads/playwright/example.png
```

Playwright `snapshot` masks raw input values by design. `inspect-form` also avoids password, hidden, and file values, but still summarize browser output carefully and avoid repeating secrets. For login pages, prefer a headed persistent session and let the user type credentials directly into the browser; do not ask the user to send passwords through chat.

## Side-Effect Commands

Treat these as side-effecting and require explicit user permission before execution. This list is illustrative, not exhaustive; if a command can change remote state, local files outside deliberate read-only inspection, account data, marketplace data, messages, calendar events, browser state, or submitted content, ask first.

- `node tools/gmail/cli.js send ...`
- `node tools/outlook/cli.js send ...`
- `node tools/gmail/cli.js move ...`
- `node tools/outlook/cli.js move ...`
- `node tools/gcalendar/cli.js add-event ...`
- `node tools/gcalendar/cli.js update-event ...`
- `node tools/gcalendar/cli.js delete-event ...`
- `node tools/gdrive/cli.js mkdir ...`
- `node tools/gdrive/cli.js upload ...`
- `node tools/gdrive/cli.js update-content ...`
- `node tools/gdrive/cli.js update ...`
- `node tools/gdrive/cli.js rename ...`
- `node tools/gdrive/cli.js move ...`
- `node tools/gdrive/cli.js copy ...`
- `node tools/gdrive/cli.js trash ...`
- `node tools/gdrive/cli.js untrash ...`
- `node tools/gdrive/cli.js delete ...`
- `node tools/onedrive/cli.js mkdir ...`
- `node tools/onedrive/cli.js upload ...`
- `node tools/onedrive/cli.js update-content ...`
- `node tools/onedrive/cli.js update ...`
- `node tools/onedrive/cli.js rename ...`
- `node tools/onedrive/cli.js move ...`
- `node tools/onedrive/cli.js copy ...`
- `node tools/onedrive/cli.js trash ...`
- `node tools/onedrive/cli.js delete ...`
- `node tools/notion/cli.js create-page ...`
- `node tools/notion/cli.js update-page ...`
- `node tools/notion/cli.js archive-page ...`
- `node tools/notion/cli.js append-block-children ...`
- `node tools/notion/cli.js update-block ...`
- `node tools/notion/cli.js archive-block ...`
- `node tools/notion/cli.js create-comment ...`
- `node tools/freelancer/cli.js bid <projectId> --amount <n> --period <days> --description "text"`
- `node tools/freelancer/cli.js profile-skills add <jobId> [jobId ...]`
- `node tools/freelancer/cli.js profile-skills remove <jobId> [jobId ...]`
- `node tools/freelancer/cli.js profile-skills set <jobId> [jobId ...]`
- `node tools/freelancer/cli.js request-milestone <projectId> --bid <bidId> --amount <n> --description "text"`
- `node tools/playwright/cli.js session start --headless false ...`
- `node tools/playwright/cli.js click ...`
- `node tools/playwright/cli.js fill ...`
- `node tools/playwright/cli.js press ...`
- `node tools/playwright/cli.js select ...`
- `node tools/playwright/cli.js check ...`
- `node tools/playwright/cli.js uncheck ...`
- `node tools/playwright/cli.js scroll ...`
- `node tools/playwright/cli.js click-index ...`
- `node tools/playwright/cli.js select-combobox ...`
- `node tools/playwright/cli.js fill-textareas ...`
- `node tools/playwright/cli.js submit-check ...`
- `node tools/playwright/cli.js screenshot --out <file> ...`
- Any command with `--open`, plus Upwork/Freelancer `open` and LinkedIn `developer`.
- Attachment downloads, because they write files under `downloads/` or a user-specified path.

For every Google Drive write command, ask for user permission first even when the user previously discussed the action. Permission must name the operation and target. Permanent delete must be explicitly confirmed as permanent.
For every OneDrive write command, ask for user permission first even when the user previously discussed the action. Permission must name the operation and target. Delete must be explicitly confirmed.
For every Freelancer profile skill update, ask for user permission first. Permission must name whether skills will be added, removed, or replaced, and list the skill names or Freelancer job/skill IDs.

Authentication commands are expected to start a localhost OAuth callback server and may need browser interaction:

```bash
node tools/gmail/cli.js auth
node tools/outlook/cli.js auth
node tools/gcalendar/cli.js auth
node tools/gdrive/cli.js auth
node tools/onedrive/cli.js auth
node tools/notion/cli.js auth
node tools/upwork/cli.js auth
node tools/freelancer/cli.js auth
```

OAuth tokens are stored under `tools/<tool>/.token.json`. Never reveal token contents.

## Output Style

Summarize personal data compactly:

- For email, show sender, subject, local date/time, and a short snippet or action item.
- For calendar, show local date/time, title, calendar, and conflicts or open windows when relevant.
- For Google Drive, show file name, file ID, MIME type, modified time, path or parent folder when available, and local download path for downloaded files.
- For OneDrive, show item name, item ID, type, MIME type when available, modified time, path or parent folder when available, and local download path for downloaded files.
- For Notion/database output, extract the fields needed for the user's task instead of pasting raw JSON.
- For job searches, rank or group results by relevance, budget, recency, or fit when the CLI returns enough data.

Mention the exact command run when it helps the user reproduce the result. Preserve privacy by omitting secrets, tokens, and unnecessary personal identifiers.

## Verification

For repo changes, run:

```bash
npm run verify
```

For command availability or routine checks, prefer non-destructive commands such as `help`, `labels`, `calendars`, `events`, `search`, `files`, or `list`.
