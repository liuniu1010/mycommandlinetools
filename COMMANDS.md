# Personal Toolset Commands

This repository contains personal command-line tools. Run commands from the
repository root unless a tool says otherwise.

## Setup

Install dependencies:

```bash
npm install
```

Create a root `.env` file for private credentials. Do not commit `.env`.

For step-by-step OAuth credential setup, see [OAUTH_SETUP.md](OAUTH_SETUP.md).

For Upwork:

```bash
UPWORK_CLIENT_ID=your_client_id
UPWORK_CLIENT_SECRET=your_client_secret
UPWORK_CALLBACK_URL=http://localhost:3000/callback
```

## Verification

Run the full verification pipeline before commits:

```bash
npm run verify
```

This runs syntax checks, lint checks, and a build:

```bash
npm run type-check
npm run lint
npm run build
```

Equivalent test command:

```bash
npm test
```

## Google Calendar

Implementation:

```text
tools/gcalendar/cli.js
```

Tool notes:

- Requires a Google Cloud OAuth client with Google Calendar API enabled.
- Uses the root `.env` file.
- Saves OAuth tokens locally to `tools/gcalendar/.token.json`, including account metadata from the primary calendar when available.
- Uses the Calendar scope so it can read calendars and create/update events.

Authenticate with Google Calendar:

```bash
node tools/gcalendar/cli.js auth
```

List calendars:

```bash
node tools/gcalendar/cli.js calendars
```

List upcoming events:

```bash
node tools/gcalendar/cli.js events --calendar primary --limit 10
```

Event output includes raw Google Calendar time plus UTC and local time fields; local time uses the current system timezone.

Create an event:

```bash
node tools/gcalendar/cli.js add-event --summary "Test" --start 2026-05-05T10:00:00+12:00 --end 2026-05-05T10:30:00+12:00
```

Update an event:

```bash
node tools/gcalendar/cli.js update-event <eventId> --summary "Updated title"
```

Delete an event:

```bash
node tools/gcalendar/cli.js delete-event <eventId>
```

## Google Drive

Implementation:

```text
tools/gdrive/cli.js
```

Tool notes:

- Requires a Google Cloud OAuth client with Google Drive API enabled.
- Uses the root `.env` file.
- Saves OAuth tokens locally to `tools/gdrive/.token.json`, including account metadata when available.
- Uses the full Drive scope by default so write commands can work.
- Downloads blob files, exports Google Docs, Sheets, Slides, and Drawings, and resolves Drive shortcuts to the original target file before downloading.
- Supports folder creation, upload, content replacement, metadata updates, move, copy, trash, untrash, and permanent delete.

Configure credentials:

```bash
GDRIVE_CLIENT_ID=your_google_oauth_client_id
GDRIVE_CLIENT_SECRET=your_google_oauth_client_secret
GDRIVE_CALLBACK_URL=http://localhost:3000/callback
GDRIVE_SCOPES=https://www.googleapis.com/auth/drive
```

Authenticate with Google Drive:

```bash
node tools/gdrive/cli.js auth
```

Search files:

```bash
node tools/gdrive/cli.js files --query "proposal" --limit 20
```

Search indexed file contents:

```bash
node tools/gdrive/cli.js files --text "resident visa" --limit 20
```

List files in a folder:

```bash
node tools/gdrive/cli.js files --folder <folderId> --limit 20
```

Read file metadata:

```bash
node tools/gdrive/cli.js get <fileId>
```

Download or export a file:

```bash
node tools/gdrive/cli.js download <fileId> --out downloads/gdrive
```

Open a file in the browser:

```bash
node tools/gdrive/cli.js open <fileId>
```

Create a folder:

```bash
node tools/gdrive/cli.js mkdir --name "Receipts" --parent <folderId>
```

Upload a file:

```bash
node tools/gdrive/cli.js upload ./report.pdf --parent <folderId>
```

Replace file content:

```bash
node tools/gdrive/cli.js update-content <fileId> ./report-v2.pdf
```

Update metadata or rename:

```bash
node tools/gdrive/cli.js update <fileId> --description "Updated from CLI"
node tools/gdrive/cli.js rename <fileId> --name "New name.pdf"
```

Move, copy, trash, untrash, or permanently delete:

```bash
node tools/gdrive/cli.js move <fileId> --to <folderId>
node tools/gdrive/cli.js copy <fileId> --name "Copy of report.pdf"
node tools/gdrive/cli.js trash <fileId>
node tools/gdrive/cli.js untrash <fileId>
node tools/gdrive/cli.js delete <fileId> --yes
```

## OneDrive

Implementation:

```text
tools/onedrive/cli.js
```

Tool notes:

- Requires a Microsoft Entra app registration with Microsoft Graph delegated
  permissions.
- Uses the root `.env` file.
- Saves OAuth tokens locally to `tools/onedrive/.token.json`, including account
  and default drive metadata when available.
- Uses the `/common` Microsoft identity endpoint, so one tool can support
  personal Microsoft accounts and work or school OneDrive accounts when the app
  registration allows them.
- Uses full delegated file access by default so write commands can work.
- Supports folder creation, upload, content replacement, metadata updates,
  move, copy, trash/delete, and browser opening.

Configure credentials:

```bash
ONEDRIVE_CLIENT_ID=your_microsoft_oauth_client_id
ONEDRIVE_CLIENT_SECRET=your_microsoft_oauth_client_secret
ONEDRIVE_CALLBACK_URL=http://localhost:3000/callback
ONEDRIVE_SCOPES=offline_access User.Read Files.ReadWrite.All
```

Authenticate with OneDrive:

```bash
node tools/onedrive/cli.js auth
```

Show the authenticated account and default drive:

```bash
node tools/onedrive/cli.js account
node tools/onedrive/cli.js me
```

Search files:

```bash
node tools/onedrive/cli.js files --query "proposal" --limit 20
node tools/onedrive/cli.js files --text "resident visa" --limit 20
```

List files in a folder:

```bash
node tools/onedrive/cli.js files --folder <folderId> --limit 20
node tools/onedrive/cli.js files --folder root --limit 20 --orderBy lastModifiedDateTime
```

`--orderBy` is intended for folder listing, not search.

Read item metadata:

```bash
node tools/onedrive/cli.js get <itemId>
node tools/onedrive/cli.js read <itemId>
```

Download a file:

```bash
node tools/onedrive/cli.js download <itemId> --out downloads/onedrive
```

Open an item in the browser:

```bash
node tools/onedrive/cli.js open <itemId>
```

Create a folder:

```bash
node tools/onedrive/cli.js mkdir --name "Receipts" --parent <folderId>
node tools/onedrive/cli.js create-folder --name "Receipts"
```

Upload a file:

```bash
node tools/onedrive/cli.js upload ./report.pdf --parent <folderId>
```

Replace file content:

```bash
node tools/onedrive/cli.js update-content <itemId> ./report-v2.pdf
node tools/onedrive/cli.js replace <itemId> ./report-v2.pdf
```

Rename:

```bash
node tools/onedrive/cli.js update <itemId> --name "New name.pdf"
node tools/onedrive/cli.js rename <itemId> --name "New name.pdf"
```

Aliases: `me` is the same as `account`, `read` is the same as `get`,
`create-folder` is the same as `mkdir`, `replace` is the same as
`update-content`, `rename` is the same as `update`, and `files`, `list`, and
`search` use the same command handler.

Move, copy, trash, or delete:

```bash
node tools/onedrive/cli.js move <itemId> --to <folderId>
node tools/onedrive/cli.js copy <itemId> --name "Copy of report.pdf"
node tools/onedrive/cli.js trash <itemId>
node tools/onedrive/cli.js delete <itemId> --yes
```

## Notion

Implementation:

```text
tools/notion/cli.js
```

Tool notes:

- Uses the official Notion REST API, not website scraping.
- Uses the root `.env` file.
- Uses OAuth 2.0 for a public Notion connection.
- Saves OAuth tokens locally to `tools/notion/.token.json`, including Notion workspace and bot metadata when available.
- The target pages and databases must be selected during OAuth authorization.
- Prints JSON responses so Codex CLI, Claude Code, and shell scripts can parse output.

Configure credentials:

```bash
NOTION_CLIENT_ID=your_notion_oauth_client_id
NOTION_CLIENT_SECRET=your_notion_oauth_client_secret
NOTION_CALLBACK_URL=http://localhost:3000/callback
NOTION_VERSION=2022-06-28
```

Authenticate with Notion:

```bash
node tools/notion/cli.js auth
```

Search Notion:

```bash
node tools/notion/cli.js search --query "Projects" --filter database --limit 10
```

Resolve a database or page by name:

```bash
node tools/notion/cli.js resolve-database "Projects"
node tools/notion/cli.js resolve-page "Project brief"
```

Read a page or database:

```bash
node tools/notion/cli.js get-page <pageId-or-url>
node tools/notion/cli.js get-database <databaseId-or-url>
```

Query a database:

```bash
node tools/notion/cli.js query-database <databaseId-or-url> --limit 20
node tools/notion/cli.js query-database <databaseId-or-url> --filter-json '{"property":"Status","status":{"equals":"Active"}}'
```

Create or update a database row:

```bash
node tools/notion/cli.js create-page --database-id <databaseId> --properties-json '{"Name":{"title":[{"text":{"content":"New item"}}]}}'
node tools/notion/cli.js update-page <pageId-or-url> --properties-json '{"Status":{"status":{"name":"Done"}}}'
```

Archive a page:

```bash
node tools/notion/cli.js archive-page <pageId-or-url>
```

Work with blocks:

```bash
node tools/notion/cli.js list-block-children <blockId-or-url>
node tools/notion/cli.js append-block-children <blockId-or-url> --children-json '[{"object":"block","type":"paragraph","paragraph":{"rich_text":[{"type":"text","text":{"content":"Note"}}]}}]'
node tools/notion/cli.js update-block <blockId-or-url> --body-json '{"paragraph":{"rich_text":[{"type":"text","text":{"content":"Updated"}}]}}'
node tools/notion/cli.js archive-block <blockId-or-url>
```

Work with comments and users:

```bash
node tools/notion/cli.js create-comment --page-id <pageId> --text "Comment from CLI"
node tools/notion/cli.js list-comments <blockId-or-url>
node tools/notion/cli.js list-users --limit 50
node tools/notion/cli.js get-user <userId>
```

Summarize database rows:

```bash
node tools/notion/cli.js query-database-summary <databaseId-or-url> --summary-json '{"metrics":[{"op":"count"}],"groupBy":{"property":"Status"}}'
```

## Freelancer.com

Implementation:

```text
tools/freelancer/cli.js
```

Tool notes:

- Uses the official Freelancer.com API, not website scraping.
- Uses the root `.env` file.
- Saves OAuth tokens locally to `tools/freelancer/.token.json`, including account metadata when available.
- Supports read-only project search/detail, profile and user lookup, profile skill reads, portfolio reads, reviews, bid reads, contests, services, messages, project messages, milestone payment reads, and milestone request reads.
- Implements notifications, but Freelancer's notifications endpoint may return 404 depending on current API availability; use `messages` for supporter/client thread checks when notifications are unavailable.
- Supports bid submission, profile skill updates, and milestone payment request submission as side-effecting commands; confirm proposal, profile skill, or milestone details before using them.
- Uses the non-standard `Freelancer-OAuth-V1` header internally. `auth --client-credentials` is available for app-only access, but user OAuth is required for bidding and most account-specific reads.

Configure credentials:

```bash
FREELANCER_CLIENT_ID=your_client_id
FREELANCER_CLIENT_SECRET=your_client_secret
FREELANCER_CALLBACK_URL=http://localhost:3000/callback
FREELANCER_SCOPE=basic fln:user:email
FREELANCER_ADVANCED_SCOPES=
```

Authenticate:

```bash
node tools/freelancer/cli.js auth
```

Search active projects:

```bash
node tools/freelancer/cli.js search "java spring boot" --limit 20
node tools/freelancer/cli.js search "backend" --full-description --user-details --location-details
```

Fetch one project by ID:

```bash
node tools/freelancer/cli.js project <projectId>
```

Open a project in the browser:

```bash
node tools/freelancer/cli.js open <projectId-or-url>
```

Read profile, client, review, bid, and milestone information:

```bash
node tools/freelancer/cli.js profile
node tools/freelancer/cli.js profile-skills list
node tools/freelancer/cli.js user <userId>
node tools/freelancer/cli.js portfolios [userId] [--limit 10] [--offset 0] [--json]
node tools/freelancer/cli.js reviews <projectId>
node tools/freelancer/cli.js bids [projectId] [--limit 10]
node tools/freelancer/cli.js milestones <projectId>
node tools/freelancer/cli.js milestone-requests --bid <bidId> [--limit 10] [--offset 0]
node tools/freelancer/cli.js request-milestone <projectId> --bid <bidId> --amount 320 --description "Working bot and setup guide"
```

`milestone-requests` reads milestone payment requests. Freelancer's API is most reliable when filtering by bid ID; filtering only by project may be denied.

`request-milestone` asks the client to create/fund a milestone payment for your bid. It changes remote account/project state, so confirm the exact project, bid, amount, and description before using it.

Update profile skills:

```bash
node tools/freelancer/cli.js profile-skills add <jobId> [jobId ...]
node tools/freelancer/cli.js profile-skills remove <jobId> [jobId ...]
node tools/freelancer/cli.js profile-skills set <jobId> [jobId ...]
```

Freelancer's API calls profile skills `jobs`, so these commands use Freelancer job/skill IDs. `add`, `remove`, and `set` update your public Freelancer profile; confirm the exact skills before using them. Freelancer enforces a maximum number of selected skills, so remove lower-priority skills before adding new ones when the profile is full.

Submit a bid:

```bash
node tools/freelancer/cli.js bid <projectId> --amount 150 --period 7 --description "I can build this"
```

For fixed-price bids, `--milestone-percentage` sets the bid percentage field but
does not guarantee the website-style milestone payment schedule row exists.
After a CLI bid submission, verify milestone requests:

```bash
node tools/freelancer/cli.js milestone-requests --bid <bidId>
```

If no milestone request is returned and Freelancer's website requires a
milestone payment row, edit the bid on Freelancer.com and add the milestone
description and amount manually.

Search contests and inspect account activity:

```bash
node tools/freelancer/cli.js contests "logo design" --limit 10
node tools/freelancer/cli.js services [serviceId ...] [--owner <userId>] [--limit 10] [--offset 0] [--reviews] [--json]
node tools/freelancer/cli.js messages [--limit 10] [--project <projectId>]
node tools/freelancer/cli.js project-messages <projectId> [--limit 10] [--offset 0]
node tools/freelancer/cli.js notifications [--limit 10] [--unread-only]
```

`services` lists your own Freelancer Services by default, lists another user's services with `--owner`, or fetches specific service IDs. Service creation is not implemented because the checked official SDK/docs do not expose a safe creation payload.

`portfolios` lists portfolio items for your account by default or for another user ID. Portfolio creation/edit/delete is not implemented because the official SDK exposes retrieval only, and write probes returned `405` or `404`; use the Freelancer website for portfolio writes.

`project-messages` uses Freelancer's project-scoped messages API. It is not a dedicated Project Public Clarification Board API; Freelancer's public documentation and the probed API endpoints did not expose one.

`messages` lists message threads. Without `--project`, it lists all available threads, including support or private chat threads returned by Freelancer's API.

## LinkedIn

Implementation:

```text
tools/linkedin/cli.js
```

Tool notes:

- Builds LinkedIn Jobs search URLs and can open them in your browser.
- Does not scrape LinkedIn, automate your account, or call restricted Talent APIs.
- Useful while keeping search/review actions manual inside LinkedIn.

Print a job search URL:

```bash
node tools/linkedin/cli.js search "java spring boot"
```

Open a filtered job search:

```bash
node tools/linkedin/cli.js search "java spring boot" --location "Auckland, New Zealand" --date week --open
```

Use extra filters:

```bash
node tools/linkedin/cli.js search "ai agent" --workplace remote,hybrid --type contract --experience senior
```

## Gmail

Implementation:

```text
tools/gmail/cli.js
```

Tool notes:

- Requires a Google Cloud OAuth client with Gmail API access enabled.
- Uses the root `.env` file.
- Saves OAuth tokens locally to `tools/gmail/.token.json`, including the authorized `account_email`.
- Uses modify and send scopes by default.

Authenticate with Gmail:

```bash
node tools/gmail/cli.js auth
```

List Gmail labels:

```bash
node tools/gmail/cli.js labels
```

List messages:

```bash
node tools/gmail/cli.js list --query "is:unread newer_than:7d" --limit 10
```

Message output includes both `date_utc` and `date_local`; local time uses the current system timezone.

Read one message:

```bash
node tools/gmail/cli.js read <messageId>
```

Move one message between Gmail labels:

```bash
node tools/gmail/cli.js move <messageId> --from "to do list" --to EGGS
node tools/gmail/cli.js move <messageId> --from "to do list" --to "New Label" --create-label
```

List attachments on one message:

```bash
node tools/gmail/cli.js attachments <messageId>
```

Download attachments from one message:

```bash
node tools/gmail/cli.js download-attachments <messageId> --out downloads/gmail
```

Send a plain-text message:

```bash
node tools/gmail/cli.js send --to you@example.com --subject "Hello" --body "Test message"
```

Send a message with one or more attachments:

```bash
node tools/gmail/cli.js send --to you@example.com --subject "Files" --body "Attached." --attach /tmp/file.pdf
node tools/gmail/cli.js send --to you@example.com --subject "Files" --body "Attached." --attach /tmp/a.pdf --attach /tmp/b.docx
```

## Outlook

Implementation:

```text
tools/outlook/cli.js
```

Tool notes:

- Requires a Microsoft Entra app registration with Microsoft Graph delegated mail permissions.
- Uses the root `.env` file.
- Saves OAuth tokens locally to `tools/outlook/.token.json`, including account metadata from Graph `/me`.
- Uses `offline_access`, `User.Read`, `Mail.ReadWrite`, and `Mail.Send` scopes by default.
- Outlook does not have Gmail-style labels; this CLI uses Outlook mail folders for `labels`, `--label`, and `--create-label`.

Configure credentials:

```bash
OUTLOOK_CLIENT_ID=your_microsoft_oauth_client_id
OUTLOOK_CLIENT_SECRET=your_microsoft_oauth_client_secret
OUTLOOK_CALLBACK_URL=http://localhost:3000/callback
OUTLOOK_SCOPES=offline_access User.Read Mail.ReadWrite Mail.Send
```

Authenticate with Outlook:

```bash
node tools/outlook/cli.js auth
```

List Outlook folders:

```bash
node tools/outlook/cli.js labels
```

List messages:

```bash
node tools/outlook/cli.js list --query "invoice" --limit 10
node tools/outlook/cli.js list --label Inbox --limit 10
```

Message output includes both `date_utc` and `date_local`; local time uses the current system timezone.

Read one message:

```bash
node tools/outlook/cli.js read <messageId>
```

Move one message between Outlook folders:

```bash
node tools/outlook/cli.js move <messageId> --from Inbox --to Archive
node tools/outlook/cli.js move <messageId> --from Inbox --to "New Folder" --create-label
```

List attachments on one message:

```bash
node tools/outlook/cli.js attachments <messageId>
```

Download attachments from one message:

```bash
node tools/outlook/cli.js download-attachments <messageId> --out downloads/outlook
```

Send a plain-text message:

```bash
node tools/outlook/cli.js send --to you@example.com --subject "Hello" --body "Test message"
```

Send a message with one or more attachments:

```bash
node tools/outlook/cli.js send --to you@example.com --subject "Files" --body "Attached." --attach /tmp/file.pdf
node tools/outlook/cli.js send --to you@example.com --subject "Files" --body "Attached." --attach /tmp/a.pdf --attach /tmp/b.docx
```

## Playwright

Implementation:

```text
tools/playwright/cli.js
```

Tool notes:

- Uses Playwright to automate Chromium or a system Chrome executable supplied
  with `--executable-path`.
- Supports persistent browser sessions so simple commands can combine into a
  larger browser workflow.
- Supports one-shot read commands with `--url` for text, HTML, links, locator
  checks, screenshots, key-line reads, form inspection, control listing, and
  page-state checks.
- Supports tabs with `tabs` and `tab use --index <n>`.
- Supports iframe targeting with `--frame <iframe-css-selector>` and repeated
  element targeting with `--nth <index>`.
- Supports common form workflows with `inspect-form`, `controls`,
  `fill-textareas`, `select-combobox`, `click-index`, `scroll`, and
  `submit-check`.
- `snapshot` masks raw input values so password and form field contents are not
  exposed by default.
- Browser profiles live under `tools/playwright/.profiles/`.
- Session metadata lives under `tools/playwright/.sessions/`.
- Do not commit browser profiles, sessions, screenshots, videos, or traces.

Install Chromium browser binaries if needed:

```bash
npx playwright install chromium
```

Start a visible session:

```bash
node tools/playwright/cli.js session start --name work --headless false
node tools/playwright/cli.js session start --name work --headless false --executable-path /usr/bin/google-chrome
```

Navigate and act in the same session:

```bash
node tools/playwright/cli.js goto https://example.com --session work
node tools/playwright/cli.js text --selector main --session work
node tools/playwright/cli.js screenshot --session work --out downloads/playwright/example.png
```

Click and fill by accessible locators:

```bash
node tools/playwright/cli.js click --role button --name "Sign in" --session work
node tools/playwright/cli.js fill --label Email --value user@example.com --session work
node tools/playwright/cli.js wait --text Dashboard --session work
```

Target iframes or repeated elements:

```bash
node tools/playwright/cli.js click --selector ".card" --nth 0 --frame iframe --session work
node tools/playwright/cli.js text --selector body --frame iframe --session work
```

Use one-shot read mode without a session:

```bash
node tools/playwright/cli.js text --url https://example.com --selector main
node tools/playwright/cli.js links --url https://example.com --limit 20
node tools/playwright/cli.js exists --url https://example.com --text "Example Domain"
node tools/playwright/cli.js read-keylines --url https://example.com --pattern "Example"
node tools/playwright/cli.js inspect-form --url https://example.com --json
```

Inspect current page state:

```bash
node tools/playwright/cli.js snapshot --session work --json
node tools/playwright/cli.js page-state --session work --json
node tools/playwright/cli.js read-keylines --session work --pattern "submitted|error|Connects" --context 1
node tools/playwright/cli.js controls --session work --pattern "submit|apply|proposal" --json
node tools/playwright/cli.js inspect-form --session work --json
```

Handle form-heavy pages and custom controls:

```bash
node tools/playwright/cli.js scroll --to bottom --session work
node tools/playwright/cli.js click-index --index 42 --session work
node tools/playwright/cli.js select-combobox --index 44 --option "Never" --session work
node tools/playwright/cli.js fill-textareas --values downloads/playwright/answers.json --session work
node tools/playwright/cli.js submit-check --role button --name "Submit proposal" --session work
```

Check or stop a session:

```bash
node tools/playwright/cli.js session status --name work
node tools/playwright/cli.js session stop --name work
```

List tabs and switch the active tab:

```bash
node tools/playwright/cli.js tabs --session work
node tools/playwright/cli.js tab use --index 1 --session work
```

Run a JSON flow:

```bash
node tools/playwright/cli.js flow downloads/example-flow.json
```

## Upwork

Implementation:

```text
tools/upwork/cli.js
```

Tool notes:

- Requires an enabled Upwork OAuth2 API key.
- Uses the root `.env` file.
- Saves OAuth tokens locally to `tools/upwork/.token.json`, including account metadata when permitted by the API key.
- Does not submit proposals. Use it to search and inspect jobs, then apply
  manually or with explicitly confirmed Playwright browser assistance in the
  Upwork website.

Authenticate with Upwork:

```bash
node tools/upwork/cli.js auth
```

Search jobs:

```bash
node tools/upwork/cli.js search "node.js openai api" --limit 20
```

Search by relevance:

```bash
node tools/upwork/cli.js search "node.js openai api" --limit 20 --sort relevance
```

Search only jobs with verified client payment, if supported by the API:

```bash
node tools/upwork/cli.js search "aws lambda" --verified-only
```

Open a job in the browser:

```bash
node tools/upwork/cli.js open <jobId-or-ciphertext>
```

Fetch one job by ID:

```bash
node tools/upwork/cli.js job <jobId>
```

Show Upwork CLI help:

```bash
node tools/upwork/cli.js help
```
