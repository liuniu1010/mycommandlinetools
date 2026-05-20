You are operating Gmail via the CLI at `tools/gmail/cli.js`. Run all commands from the repository root.

## Auth
```
node tools/gmail/cli.js auth
```
Opens a browser OAuth flow. Token saved to `tools/gmail/.token.json`. Run if any command returns an auth error.

## Listing & reading
```
# List messages (default 10, max 50)
node tools/gmail/cli.js list
node tools/gmail/cli.js list --query "is:unread" --limit 20
node tools/gmail/cli.js list --query "from:someone@example.com newer_than:7d"
node tools/gmail/cli.js list --label LABELID

# Read a single message (full JSON with date_utc, date_local)
node tools/gmail/cli.js read <messageId>

# List all labels
node tools/gmail/cli.js labels
```

## Attachments
```
node tools/gmail/cli.js attachments <messageId>
node tools/gmail/cli.js download-attachments <messageId>
node tools/gmail/cli.js download-attachments <messageId> --out ./downloads/invoices
```

## Moving messages
```
node tools/gmail/cli.js move <messageId> --from INBOX --to LABEL
node tools/gmail/cli.js move <messageId> --from INBOX --to NewLabel --create-label
```
`--from` can be repeated to remove multiple labels simultaneously.

## Sending email — ALWAYS require user confirmation first

**Never execute the send command without showing a confirmation summary first.**

Before sending, display all of the following and explicitly ask the user to approve:

```
To:          <recipient>
Subject:     <title>
Body:
  <full email body>
Attachments: <file paths, or "none">
```

Only after the user confirms, run:
```
node tools/gmail/cli.js send --to EMAIL --subject "SUBJECT" --body "BODY"
node tools/gmail/cli.js send --to EMAIL --subject "SUBJECT" --body "BODY" --attach /path/to/file.pdf
```
Multiple `--attach` flags are supported for multiple attachments.

## Notes
- Query syntax follows Gmail search operators (`is:unread`, `from:`, `subject:`, `newer_than:`, `has:attachment`, etc.)
- Message IDs come from the `id` field in `list` output
- Output always includes both `date_utc` (ISO) and `date_local` (system local time)
- If the user also has Outlook and hasn't specified which service to use, ask before proceeding
