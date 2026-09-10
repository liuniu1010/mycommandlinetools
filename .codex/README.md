# Project MCP configuration

This directory configures project-scoped Codex integrations. Codex loads it
only for trusted projects.

## RapidAPI DevOps Doctor

The `rapidapi_devops_doctor` MCP server connects to the DevOps Doctor API
through RapidAPI. It deliberately does not store an API key in this repository.

1. Rotate any key that was shared outside its intended secret store.
2. In the shell from which you start Codex, set the replacement key:

   ```bash
   export RAPIDAPI_KEY='your-new-rapidapi-key'
   ```

3. Start or restart Codex from this repository, then use `/mcp` to confirm the
   server is connected. From the CLI, `codex mcp list` lists configured servers.

The configuration forwards only `RAPIDAPI_KEY` to the local `mcp-remote`
process, which starts via `npx` and connects to `https://mcp.rapidapi.com`.
