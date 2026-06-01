# OneDrive CLI

Personal CLI for OneDrive OAuth, file search, metadata reads, downloads,
uploads, file management, and browser opening through Microsoft Graph.

## Setup

Create or update `.env` in the repository root:

```bash
ONEDRIVE_CLIENT_ID=your_microsoft_oauth_client_id
ONEDRIVE_CLIENT_SECRET=your_microsoft_oauth_client_secret
ONEDRIVE_CALLBACK_URL=http://localhost:3000/callback
ONEDRIVE_SCOPES=offline_access User.Read Files.ReadWrite.All
```

Create an app registration in Microsoft Entra admin center, add the callback URL
above as a web redirect URI, and allow the delegated Microsoft Graph
permissions listed in `ONEDRIVE_SCOPES`. Use a supported account type that
includes the account you want to connect. The same CLI supports personal
Microsoft accounts and work or school OneDrive accounts when the app
registration allows them.

For step-by-step Microsoft credential setup, see
[../../OAUTH_SETUP.md#microsoft-outlook-mail](../../OAUTH_SETUP.md#microsoft-outlook-mail).
Use the `ONEDRIVE_*` environment variables and file permissions instead of the
Outlook-specific values.

## Usage

```bash
node tools/onedrive/cli.js auth
node tools/onedrive/cli.js account
node tools/onedrive/cli.js me
node tools/onedrive/cli.js files --query "proposal" --limit 20
node tools/onedrive/cli.js files --text "resident visa" --limit 20
node tools/onedrive/cli.js files --folder <folderId> --limit 20
node tools/onedrive/cli.js files --folder root --limit 20 --orderBy lastModifiedDateTime
node tools/onedrive/cli.js get <itemId>
node tools/onedrive/cli.js read <itemId>
node tools/onedrive/cli.js download <itemId> --out downloads/onedrive
node tools/onedrive/cli.js open <itemId>
node tools/onedrive/cli.js mkdir --name "Receipts"
node tools/onedrive/cli.js create-folder --name "Receipts"
node tools/onedrive/cli.js upload ./report.pdf --parent <folderId>
node tools/onedrive/cli.js update-content <itemId> ./report-v2.pdf
node tools/onedrive/cli.js replace <itemId> ./report-v2.pdf
node tools/onedrive/cli.js rename <itemId> --name "New name.pdf"
node tools/onedrive/cli.js move <itemId> --to <folderId>
node tools/onedrive/cli.js copy <itemId> --name "Copy of report.pdf"
node tools/onedrive/cli.js trash <itemId>
node tools/onedrive/cli.js delete <itemId> --yes
```

OAuth tokens are stored locally in `tools/onedrive/.token.json`. The token file
also includes account and default drive metadata from Microsoft Graph when
available.

The default scope is full delegated file access so write commands can work.
Some work or school tenants require administrator consent for file permissions.
If consent or scopes change, update `ONEDRIVE_SCOPES`, remove
`tools/onedrive/.token.json`, and run `node tools/onedrive/cli.js auth` again.

Use `--query` or `--text` to search the default OneDrive hierarchy through the
Microsoft Graph search API. Use `--folder root` to list the root folder, or
pass a folder item ID to list a specific folder. `--orderBy` is intended for
folder listing, not search. Blob and Office files are downloaded through
Microsoft Graph `/content`.

Aliases: `me` is the same as `account`, `read` is the same as `get`,
`create-folder` is the same as `mkdir`, `replace` is the same as
`update-content`, `rename` is the same as `update`, and `files`, `list`, and
`search` use the same command handler.

Write commands support creating folders, uploading files, replacing file
content, renaming, moving, copying, and deleting items. OneDrive delete
operations usually move items to the recycle bin. `delete` requires `--yes`;
`trash` is provided as a shorter alias.
