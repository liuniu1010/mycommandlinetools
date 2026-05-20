You are operating Notion via the CLI at `tools/notion/cli.js`. Run all commands from the repository root.

## Auth
```
node tools/notion/cli.js auth
```
Opens a browser OAuth flow; the user must select which pages/databases Notion can access. Token saved to `tools/notion/.token.json`. Run if any command returns an auth error.

## Searching
```
# Search across all accessible pages and databases
node tools/notion/cli.js search
node tools/notion/cli.js search --query "project name"
node tools/notion/cli.js search --filter page
node tools/notion/cli.js search --filter database
node tools/notion/cli.js search --limit 20
```

## Resolving pages/databases by name
```
# Find a page or database ID by human-readable name (ranked by match quality)
node tools/notion/cli.js resolve-page "My Notes"
node tools/notion/cli.js resolve-database "Tasks"
```
Use these to get an ID when you only know the name, then use the ID for subsequent commands.

## Pages
```
# Get page details
node tools/notion/cli.js get-page <id-or-url>

# Create a page in a database
node tools/notion/cli.js create-page \
  --database-id DATABASE_ID \
  --properties-json '{"Name": {"title": [{"text": {"content": "New row"}}]}}'

# Create a sub-page inside another page
node tools/notion/cli.js create-page \
  --page-id PARENT_PAGE_ID \
  --properties-json '{"title": [{"text": {"content": "Sub-page title"}}]}'

# Update page properties
node tools/notion/cli.js update-page <id-or-url> --properties-json '{...}'

# Archive a page
node tools/notion/cli.js archive-page <id-or-url>
```
IDs can be raw UUIDs (with or without hyphens) or full Notion share URLs — the CLI normalises them.

## Databases
```
# Get database schema
node tools/notion/cli.js get-database <id-or-url>

# Query rows in a database
node tools/notion/cli.js query-database <id-or-url>
node tools/notion/cli.js query-database <id-or-url> --limit 20
node tools/notion/cli.js query-database <id-or-url> \
  --filter-json '{"property":"Status","select":{"equals":"Done"}}' \
  --sorts-json '[{"property":"Created","direction":"descending"}]'

# Analytics / summary over a database
node tools/notion/cli.js query-database-summary <id-or-url> \
  --summary-json '{"metrics":[{"op":"count"},{"op":"sum","field":"Amount"}]}'
```

## Blocks
```
# List blocks inside a page or block
node tools/notion/cli.js list-block-children <blockId>

# Append blocks
node tools/notion/cli.js append-block-children <blockId> \
  --children-json '[{"object":"block","type":"paragraph","paragraph":{"rich_text":[{"type":"text","text":{"content":"Hello"}}]}}]'

# Update a block
node tools/notion/cli.js update-block <blockId> --body-json '{...}'

# Archive a block
node tools/notion/cli.js archive-block <blockId>
```

## Comments & users
```
node tools/notion/cli.js create-comment --page-id PAGE_ID --text "My comment"
node tools/notion/cli.js list-comments <blockId>
node tools/notion/cli.js list-users
node tools/notion/cli.js get-user <userId>
```

## Notes
- All commands output `{success: true, data: {...}}` or `{success: false, error: "..."}` JSON
- Page size is capped at 50 per request; use `--start-cursor` for pagination
- When creating database rows, the title/Name property is required and auto-validated
- Prefer `resolve-database` / `resolve-page` to find IDs when the user gives a name, not a URL
