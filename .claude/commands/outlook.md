You are operating Outlook (Microsoft 365 Mail) via the CLI at `tools/outlook/cli.js`. Run all commands from the repository root.

## Auth
```
node tools/outlook/cli.js auth
```
Opens a Microsoft OAuth flow (Entra ID). Token saved to `tools/outlook/.token.json`. Run if any command returns an auth error.

## Listing & reading
```
# List messages (default 10, max 50)
node tools/outlook/cli.js list
node tools/outlook/cli.js list --query "from:client@example.com" --limit 20
node tools/outlook/cli.js list --label Inbox

# Read a single message (full JSON with receivedDateTime, sentDateTime)
node tools/outlook/cli.js read <messageId>

# List all folders (Outlook equivalent of labels)
node tools/outlook/cli.js labels
```
Folders include: displayName, totalItemCount, unreadItemCount, childFolderCount.

## Attachments
```
node tools/outlook/cli.js attachments <messageId>
node tools/outlook/cli.js download-attachments <messageId>
node tools/outlook/cli.js download-attachments <messageId> --out ./downloads/invoices
```

## Moving messages
```
node tools/outlook/cli.js move <messageId> --from Inbox --to Archive
node tools/outlook/cli.js move <messageId> --from Inbox --to NewFolder --create-label
```
`--from` can be repeated to move out of multiple folders simultaneously.

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
node tools/outlook/cli.js send --to EMAIL --subject "SUBJECT" --body "BODY"
node tools/outlook/cli.js send --to EMAIL --subject "SUBJECT" --body "BODY" --attach /path/to/file.pdf
```
Multiple `--attach` flags are supported for multiple attachments.

## Notes
- Outlook uses folders (not labels), but the CLI flag is still `--label` for consistency
- Search queries use `"quoted strings"` syntax; quotes are automatically escaped
- The CLI adds `ConsistencyLevel: eventual` for search queries automatically
- Message output includes both `receivedDateTime` and `sentDateTime`
- If the user also has Gmail and hasn't specified which service to use, ask before proceeding
