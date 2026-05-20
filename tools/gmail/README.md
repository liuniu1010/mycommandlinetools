# Gmail CLI

Personal CLI for Gmail OAuth, message search, message reads, and simple sends.

## Setup

Create or update `.env` in the repository root:

```bash
GMAIL_CLIENT_ID=your_google_oauth_client_id
GMAIL_CLIENT_SECRET=your_google_oauth_client_secret
GMAIL_CALLBACK_URL=http://localhost:3000/callback
GMAIL_SCOPES=https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send
```

Create the OAuth client in Google Cloud Console as a web application and add the callback URL above as an authorized redirect URI.
For step-by-step credential setup, see [../../OAUTH_SETUP.md#google-gmail-google-calendar-and-google-drive](../../OAUTH_SETUP.md#google-gmail-google-calendar-and-google-drive).

## Usage

```bash
node tools/gmail/cli.js auth
node tools/gmail/cli.js labels
node tools/gmail/cli.js list --query "is:unread newer_than:7d" --limit 10
node tools/gmail/cli.js read <messageId>
node tools/gmail/cli.js move <messageId> --from "to do list" --to EGGS
node tools/gmail/cli.js move <messageId> --from "to do list" --to "New Label" --create-label
node tools/gmail/cli.js attachments <messageId>
node tools/gmail/cli.js download-attachments <messageId> --out downloads/gmail
node tools/gmail/cli.js send --to you@example.com --subject "Hello" --body "Test message"
node tools/gmail/cli.js send --to you@example.com --subject "Files" --body "Attached." --attach /tmp/file.pdf
```

OAuth tokens are stored locally in `tools/gmail/.token.json`. The token file also includes `account_email` so you can see which Gmail account authorized the CLI.

Message list and read output include both `date_utc` and `date_local`; local time uses the current system timezone.

The `move` command uses Gmail labels: it adds the target label and removes the source label. Use `--create-label` to create a missing target label.
