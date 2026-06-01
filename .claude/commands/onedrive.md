You are operating OneDrive via the CLI at `tools/onedrive/cli.js`. Run all commands from the repository root.

## Auth
```
node tools/onedrive/cli.js auth
```
Opens a browser OAuth flow (Microsoft). Token saved to `tools/onedrive/.token.json`. Run if any command returns an auth error.

## Account info
```
node tools/onedrive/cli.js account
node tools/onedrive/cli.js me
```
Prints the signed-in user and default drive details (email, name, drive ID, drive type, owner, scope, token expiry). `me` is an alias for `account`.

## Listing / searching files
```
# List recent files (default: 10, max: 100)
node tools/onedrive/cli.js files
node tools/onedrive/cli.js files --limit 20

# Search by name or content (both --query and --text use the same OneDrive search API)
node tools/onedrive/cli.js files --query "invoice"
node tools/onedrive/cli.js files --text "resident visa"

# List files in a specific folder
node tools/onedrive/cli.js files --folder <folderId>

# List root folder
node tools/onedrive/cli.js files --folder root

# Sort results
node tools/onedrive/cli.js files --orderBy lastModifiedDateTime
```
`files`, `list`, and `search` are aliases for the same command. `--query` and `--q` are also aliases.
Item output includes id, type, mimeType, size, lastModifiedDateTime, webUrl, and parent info.

## Getting a single item
```
node tools/onedrive/cli.js get <itemId>
node tools/onedrive/cli.js read <itemId>
```
Returns full metadata as JSON. `read` is an alias for `get`.

## Downloading files
```
# Download to downloads/onedrive/ (default output directory)
node tools/onedrive/cli.js download <itemId>

# Download to a custom directory
node tools/onedrive/cli.js download <itemId> --out /path/to/dir
```
Files are downloaded via Microsoft Graph `/content`. Filenames are made safe and deduplicated automatically. Folders cannot be downloaded — use `files --folder` to browse a folder's contents instead.

## Opening files in browser
```
node tools/onedrive/cli.js open <itemId>
```
Prints the webUrl and opens it in the default browser.

## Creating folders
**Ask the user for approval before running.**
```
node tools/onedrive/cli.js mkdir --name "Receipts"
node tools/onedrive/cli.js mkdir --name "Receipts" --parent <parentFolderId>
```
`mkdir` and `create-folder` are aliases for the same command. If a folder with the same name already exists, OneDrive auto-renames the new one.

## Uploading files
**Ask the user for approval before running.** Show the local file path, destination folder (if any), and name that will be used on OneDrive.
```
# Upload a local file
node tools/onedrive/cli.js upload ./report.pdf

# Upload with a custom name and into a specific folder
node tools/onedrive/cli.js upload ./report.pdf --name "Q1 Report.pdf" --parent <folderId>

# Override MIME type
node tools/onedrive/cli.js upload ./data.csv --mime text/csv
```
MIME type is auto-detected from extension if `--mime` is omitted. If a file with the same name already exists in the folder, OneDrive auto-renames the upload.

## Updating file content
**Ask the user for approval before running.** Show the file name/ID and the local file that will replace its content.
```
node tools/onedrive/cli.js update-content <itemId> <localFile>
node tools/onedrive/cli.js update-content <itemId> <localFile> --mime <mimeType>
```
Replaces the content of an existing OneDrive item. The item ID stays the same. `update-content` and `replace` are aliases for the same command.

## Updating metadata (rename)
**Ask the user for approval before running.** Show the current file name and the changes that will be applied.
```
node tools/onedrive/cli.js update <itemId> --name "New name.pdf"
```
`update` and `rename` are aliases for the same command. Only `--name` is supported; at least one flag must be provided.

## Moving files
**Ask the user for approval before running.** Show the file name, current location, and destination folder.
```
node tools/onedrive/cli.js move <itemId> --to <targetFolderId>

# Optionally rename while moving
node tools/onedrive/cli.js move <itemId> --to <targetFolderId> --name "New name.pdf"
```

## Copying files
**Ask the user for approval before running.** Show the source file name and destination details.
```
node tools/onedrive/cli.js copy <itemId>
node tools/onedrive/cli.js copy <itemId> --name "Copy of report.pdf"
node tools/onedrive/cli.js copy <itemId> --parent <folderId>
```
OneDrive completes copy operations asynchronously — the command returns immediately after the copy is accepted.

## Trashing items
**Ask the user for approval before running.** Show the item name and ID.
```
# Move to recycle bin
node tools/onedrive/cli.js trash <itemId>
```
OneDrive usually moves deleted items to the recycle bin (recoverable from OneDrive web).

## Permanent delete
**Ask the user for approval before running.** This is irreversible — show the item name and ID and warn the user explicitly. Prefer `trash` when in doubt.
```
node tools/onedrive/cli.js delete <itemId> --yes
```
Requires `--yes` as a safety guard. OneDrive may still move the item to the recycle bin depending on account type.

## Notes
- Item IDs come from the `id` field in `files` or `get` output
- `files`, `list`, and `search` are aliases for the same command
- `update` and `rename` are aliases for the same command
- `update-content` and `replace` are aliases for the same command
- `get` and `read` are aliases for the same command
- `mkdir` and `create-folder` are aliases for the same command
- `account` and `me` are aliases for the same command
- `--query` and `--text` both use the same OneDrive search API (searching names and content)
- Folders cannot be downloaded directly
- Read-only operations (`files`, `get`, `download`, `open`, `account`) do not require approval
