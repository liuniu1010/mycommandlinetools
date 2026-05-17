# Personal Toolset Commands

This repository contains personal command-line tools. Run commands from the
repository root unless a tool says otherwise.

## Setup

Install dependencies:

```bash
npm install
```

Create a root `.env` file for private credentials. Do not commit `.env`.

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
- Saves OAuth tokens locally to `tools/gcalendar/.token.json`.
- Uses the Calendar scope so it can read calendars and create/update events.

Authenticate with Google Calendar:

```bash
npm run gcalendar:auth
```

List calendars:

```bash
npm run gcalendar:calendars
```

List upcoming events:

```bash
npm run gcalendar:events -- --calendar primary --limit 10
```

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

## Freelancer.com

Implementation:

```text
tools/freelancer/cli.js
```

Tool notes:

- Uses the official Freelancer.com API, not website scraping.
- Uses the root `.env` file.
- Saves OAuth tokens locally to `tools/freelancer/.token.json`.
- Starts with read-only project search and project detail commands.

Configure credentials:

```bash
FREELANCER_CLIENT_ID=your_client_id
FREELANCER_CLIENT_SECRET=your_client_secret
FREELANCER_CALLBACK_URL=http://localhost:3000/callback
```

Authenticate:

```bash
npm run freelancer:auth
```

Search active projects:

```bash
npm run freelancer:search -- "java spring boot" --limit 20
```

Fetch one project by ID:

```bash
node tools/freelancer/cli.js project <projectId>
```

Open a project in the browser:

```bash
node tools/freelancer/cli.js open <projectId-or-url>
```

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
npm run linkedin:search -- "java spring boot"
```

Open a filtered job search:

```bash
npm run linkedin:search -- "java spring boot" --location "Auckland, New Zealand" --date week --open
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
npm run gmail:auth
```

List Gmail labels:

```bash
npm run gmail:labels
```

List messages:

```bash
npm run gmail:list -- --query "is:unread newer_than:7d" --limit 10
```

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

## Upwork

Implementation:

```text
tools/upwork/cli.js
```

Tool notes:

- Requires an enabled Upwork OAuth2 API key.
- Uses the root `.env` file.
- Saves OAuth tokens locally to `tools/upwork/.token.json`.
- Does not submit proposals. Use it to search and inspect jobs, then apply
  manually in the Upwork website.

Authenticate with Upwork:

```bash
npm run upwork:auth
```

Search jobs:

```bash
npm run upwork:search -- "node.js openai api" --limit 20
```

Search by relevance:

```bash
npm run upwork:search -- "node.js openai api" --limit 20 --sort relevance
```

Search only jobs with verified client payment, if supported by the API:

```bash
npm run upwork:search -- "aws lambda" --verified-only
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
