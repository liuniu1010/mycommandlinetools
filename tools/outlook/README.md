# Outlook CLI

Personal CLI for Outlook Mail OAuth, folder listing, message reads, message
moves, attachments, and sending mail through Microsoft Graph.

## Setup

Create or update `.env` in the repository root:

```bash
OUTLOOK_CLIENT_ID=your_microsoft_oauth_client_id
OUTLOOK_CLIENT_SECRET=your_microsoft_oauth_client_secret
OUTLOOK_CALLBACK_URL=http://localhost:3000/callback
OUTLOOK_SCOPES=offline_access User.Read Mail.ReadWrite Mail.Send
```

Create an app registration in Microsoft Entra admin center, add the callback URL
above as a web redirect URI, and allow the delegated Microsoft Graph
permissions listed in `OUTLOOK_SCOPES`.
For step-by-step credential setup, see [../../OAUTH_SETUP.md#microsoft-outlook-mail](../../OAUTH_SETUP.md#microsoft-outlook-mail).

## Usage

```bash
node tools/outlook/cli.js auth
node tools/outlook/cli.js labels
node tools/outlook/cli.js list --query "invoice" --limit 10
node tools/outlook/cli.js list --label Inbox --limit 10
node tools/outlook/cli.js read <messageId>
node tools/outlook/cli.js move <messageId> --from Inbox --to Archive
node tools/outlook/cli.js move <messageId> --from Inbox --to "New Folder" --create-label
node tools/outlook/cli.js attachments <messageId>
node tools/outlook/cli.js download-attachments <messageId> --out downloads/outlook
node tools/outlook/cli.js send --to you@example.com --subject "Hello" --body "Test message"
node tools/outlook/cli.js send --to you@example.com --subject "Files" --body "Attached." --attach /tmp/file.pdf
```

OAuth tokens are stored locally in `tools/outlook/.token.json`. The token file
also includes account metadata from Microsoft Graph `/me` when available.

Outlook does not have Gmail-style labels. This CLI keeps the same command names
as Gmail for agent compatibility, but `labels`, `--label`, and `--create-label`
operate on Outlook mail folders.

Message list and read output include both `date_utc` and `date_local`; local
time uses the current system timezone.
