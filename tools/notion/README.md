# Notion CLI

Personal CLI for Notion pages, databases, blocks, comments, and users.

This tool is command-line only. It does not expose LangChain tools or any LLM
tool wrapper.

## Setup

Create a public Notion connection in the Notion Developer portal. Add this
redirect URI to the OAuth configuration:

```text
http://localhost:3000/callback
```

For step-by-step credential setup, see [../../OAUTH_SETUP.md#notion](../../OAUTH_SETUP.md#notion).

Create or update `.env` in the repository root:

```bash
NOTION_CLIENT_ID=your_notion_oauth_client_id
NOTION_CLIENT_SECRET=your_notion_oauth_client_secret
NOTION_CALLBACK_URL=http://localhost:3000/callback
NOTION_VERSION=2022-06-28
```

Authenticate and select the pages or databases this connection can access:

```bash
node tools/notion/cli.js auth
```

OAuth tokens are stored locally in `tools/notion/.token.json`.

## Usage

Search pages or databases:

```bash
node tools/notion/cli.js search --query "Projects" --filter database --limit 10
```

Resolve a database or page by name:

```bash
node tools/notion/cli.js resolve-database "Projects"
node tools/notion/cli.js resolve-page "Project brief"
```

Read a page or database:

```bash
node tools/notion/cli.js get-page <pageId-or-url>
node tools/notion/cli.js get-database <databaseId-or-url>
```

Query a database:

```bash
node tools/notion/cli.js query-database <databaseId-or-url> --limit 20
node tools/notion/cli.js query-database <databaseId-or-url> --filter-json '{"property":"Status","status":{"equals":"Active"}}'
```

Create or update a database row:

```bash
node tools/notion/cli.js create-page --database-id <databaseId> --properties-json '{"Name":{"title":[{"text":{"content":"New item"}}]}}'
node tools/notion/cli.js update-page <pageId-or-url> --properties-json '{"Status":{"status":{"name":"Done"}}}'
```

Archive a page:

```bash
node tools/notion/cli.js archive-page <pageId-or-url>
```

Work with blocks:

```bash
node tools/notion/cli.js list-block-children <blockId-or-url>
node tools/notion/cli.js append-block-children <blockId-or-url> --children-json '[{"object":"block","type":"paragraph","paragraph":{"rich_text":[{"type":"text","text":{"content":"Note"}}]}}]'
node tools/notion/cli.js update-block <blockId-or-url> --body-json '{"paragraph":{"rich_text":[{"type":"text","text":{"content":"Updated"}}]}}'
node tools/notion/cli.js archive-block <blockId-or-url>
```

Work with comments and users:

```bash
node tools/notion/cli.js create-comment --page-id <pageId> --text "Comment from CLI"
node tools/notion/cli.js list-comments <blockId-or-url>
node tools/notion/cli.js list-users --limit 50
node tools/notion/cli.js get-user <userId>
```

Summarize database rows:

```bash
node tools/notion/cli.js query-database-summary <databaseId-or-url> --summary-json '{"metrics":[{"op":"count"}],"groupBy":{"property":"Status"}}'
```

For larger payloads, write JSON to a file and pass it with `--json-file`.
All commands print JSON responses so Codex CLI, Claude Code, and shell scripts
can parse results reliably.
