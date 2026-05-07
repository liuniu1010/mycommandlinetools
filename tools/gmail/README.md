# Gmail CLI

Personal CLI for Gmail OAuth, message search, message reads, and simple sends.

## Setup

Create or update `.env` in the repository root:

```bash
GMAIL_CLIENT_ID=your_google_oauth_client_id
GMAIL_CLIENT_SECRET=your_google_oauth_client_secret
GMAIL_CALLBACK_URL=http://localhost:3000/callback
```

Create the OAuth client in Google Cloud Console as a web application and add the callback URL above as an authorized redirect URI.

## Usage

```bash
npm run gmail:auth
npm run gmail:labels
npm run gmail:list -- --query "is:unread newer_than:7d" --limit 10
node tools/gmail/cli.js read <messageId>
node tools/gmail/cli.js attachments <messageId>
node tools/gmail/cli.js download-attachments <messageId> --out downloads/gmail
node tools/gmail/cli.js send --to you@example.com --subject "Hello" --body "Test message"
node tools/gmail/cli.js send --to you@example.com --subject "Files" --body "Attached." --attach /tmp/file.pdf
```

OAuth tokens are stored locally in `tools/gmail/.token.json`.
