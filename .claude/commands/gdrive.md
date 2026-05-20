You are operating Google Drive via the CLI at `tools/gdrive/cli.js`. Run all commands from the repository root.

## Auth
```
node tools/gdrive/cli.js auth
```
Opens a browser OAuth flow. Token saved to `tools/gdrive/.token.json`. Run if any command returns an auth error.

## Listing / searching files
```
# List recent files (default: 10)
node tools/gdrive/cli.js files
node tools/gdrive/cli.js files --limit 20

# Search by name
node tools/gdrive/cli.js files --query "invoice"

# Full-text search inside files
node tools/gdrive/cli.js files --text "resident visa"

# List files in a specific folder
node tools/gdrive/cli.js files --folder <folderId>

# Include trashed files
node tools/gdrive/cli.js files --include-trashed
```
File output includes id, name, mimeType, size, modifiedTime, webViewLink, and parents.

## Getting a single file
```
node tools/gdrive/cli.js get <fileId>
```
Returns full metadata as JSON.

## Downloading files
```
# Download to downloads/gdrive/ (default output directory)
node tools/gdrive/cli.js download <fileId>

# Download to a custom directory
node tools/gdrive/cli.js download <fileId> --out /path/to/dir

# Google Docs → export as Word (.docx)
node tools/gdrive/cli.js download <fileId> --mime application/vnd.openxmlformats-officedocument.wordprocessingml.document

# Google Sheets → export as CSV
node tools/gdrive/cli.js download <fileId> --mime text/csv
```
Google Docs/Sheets/Slides are exported automatically (default: PDF). Binary files are downloaded as-is. Filenames are made safe and deduplicated automatically.

## Opening files in browser
```
node tools/gdrive/cli.js open <fileId>
```
Prints the webViewLink and opens it in the default browser.

## Creating folders
**Ask the user for approval before running.**
```
node tools/gdrive/cli.js mkdir --name "Receipts"
node tools/gdrive/cli.js mkdir --name "Receipts" --parent <parentFolderId>
```

## Uploading files
**Ask the user for approval before running.** Show the local file path, destination folder (if any), and name that will be used on Drive.
```
# Upload a local file
node tools/gdrive/cli.js upload ./report.pdf

# Upload with a custom name and into a specific folder
node tools/gdrive/cli.js upload ./report.pdf --name "Q1 Report.pdf" --parent <folderId>

# Override MIME type
node tools/gdrive/cli.js upload ./data.csv --mime text/csv
```

## Updating file content
**Ask the user for approval before running.** Show the file name/ID and the local file that will replace its content.
```
node tools/gdrive/cli.js update-content <fileId> <localFile>
node tools/gdrive/cli.js update-content <fileId> <localFile> --name "New filename.pdf"
```
Replaces the content of an existing Drive file. The file ID stays the same.

## Updating metadata (rename, description, star)
**Ask the user for approval before running.** Show the current file name and the changes that will be applied.
```
node tools/gdrive/cli.js update <fileId> --name "New name.pdf"
node tools/gdrive/cli.js update <fileId> --description "Q1 financials"
node tools/gdrive/cli.js update <fileId> --starred true
```
Only include flags for fields you want to change.

## Moving files
**Ask the user for approval before running.** Show the file name, current location, and destination folder.
```
node tools/gdrive/cli.js move <fileId> --to <targetFolderId>

# Explicitly specify the source folder (avoids an extra API call)
node tools/gdrive/cli.js move <fileId> --to <targetFolderId> --from <sourceFolderId>
```

## Copying files
**Ask the user for approval before running.** Show the source file name and destination details.
```
node tools/gdrive/cli.js copy <fileId>
node tools/gdrive/cli.js copy <fileId> --name "Copy of report.pdf"
node tools/gdrive/cli.js copy <fileId> --parent <folderId>
```

## Trashing and restoring
**Ask the user for approval before running.** Show the file name and ID.
```
# Move to trash (reversible)
node tools/gdrive/cli.js trash <fileId>

# Restore from trash
node tools/gdrive/cli.js untrash <fileId>
```

## Permanent delete
**Ask the user for approval before running.** This is irreversible — show the file name and ID and warn the user explicitly. Prefer `trash` when in doubt.
```
node tools/gdrive/cli.js delete <fileId> --yes
```
Permanently deletes the file. Requires `--yes` as a safety guard.

## Notes
- File IDs come from the `id` field in `files` or `get` output
- Google Doc/Sheet/Slide files cannot be downloaded directly — use `download` with an export `--mime` or let it default to PDF
- `update` and `rename` are aliases for the same command
- `files`, `list`, and `search` are aliases for the same command
- Read-only operations (files, get, download, open) do not require approval
