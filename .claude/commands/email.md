You are handling an email-related request for a user who has both Gmail and Outlook configured.

## Step 1 — Clarify the service

Before doing anything, ask the user which email service to use:
- **Gmail** (`node tools/gmail/cli.js`)
- **Outlook** (`node tools/outlook/cli.js`)

Do not assume or proceed without confirmation. Ask once, clearly.

## Step 2 — Once the service is chosen

Follow the rules for that service. Both services share the same command structure:

### Reading / listing email
```
node tools/gmail/cli.js list [--query "..."] [--limit N] [--label LABELID]
node tools/gmail/cli.js read <messageId>
node tools/gmail/cli.js labels
node tools/gmail/cli.js attachments <messageId>
node tools/gmail/cli.js download-attachments <messageId> [--out PATH]

node tools/outlook/cli.js list [--query "..."] [--limit N] [--label FOLDERNAME]
node tools/outlook/cli.js read <messageId>
node tools/outlook/cli.js labels
node tools/outlook/cli.js attachments <messageId>
node tools/outlook/cli.js download-attachments <messageId> [--out PATH]
```

Gmail list output fields: id, from, subject, date_utc, date_local, snippet.
Outlook list output fields: id, from, subject, receivedDateTime, sentDateTime, bodyPreview.

### Moving / organising
```
node tools/gmail/cli.js move <id> --from LABEL --to LABEL [--create-label]
node tools/outlook/cli.js move <id> --from FOLDER --to FOLDER [--create-label]
```
`--from` can be repeated to remove multiple labels/folders at once.

### Sending email — ALWAYS require user confirmation first

**Never call the send command directly.** Before sending, assemble and display:
1. **To:** recipient address
2. **Subject:** email title
3. **Body:** full email content
4. **Attachments:** list of file paths (if any)

Present all four items clearly and ask the user to confirm before executing. Only run the send command after explicit approval.

```
node tools/gmail/cli.js send --to EMAIL --subject "..." --body "..." [--attach FILE]
node tools/outlook/cli.js send --to EMAIL --subject "..." --body "..." [--attach FILE]
```
Multiple `--attach FILE` flags are supported for multiple attachments.

## Auth
If a command returns an auth error, run `node tools/gmail/cli.js auth` or `node tools/outlook/cli.js auth` and tell the user to complete the browser OAuth flow.
