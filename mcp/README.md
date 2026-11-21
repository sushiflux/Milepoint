# Milepoint MCP Server

Local `stdio` MCP (Model Context Protocol) server for **Milepoint**, allowing AI clients such as **Claude Desktop** or **Antigravity** to list projects/boards/cards, create bugs/ideas/tasks, move cards across columns, and manage project notes.

## 1. Build

```bash
cd mcp
npm install
npm run build
```

## 2. Create an API token in Milepoint

1. Open Milepoint in your browser and sign in.
2. Go to **Einstellungen → API-Tokens** (`?tab=api-tokens`).
3. Create a new token (e.g. `Claude Desktop`) and copy the `mp_...` value once.

## 3. Configure your MCP client

Add an entry to your client's MCP configuration (e.g. `claude_desktop_config.json` or Antigravity `mcp_config.json`):

```json
{
  "mcpServers": {
    "milepoint": {
      "command": "node",
      "args": ["/path/to/Milepoint/mcp/dist/index.js"],
      "env": {
        "MILEPOINT_URL": "https://milepoint.example.com",
        "MILEPOINT_API_KEY": "mp_your_token_here"
      }
    }
  }
}
```

### Local Dev environment (self-signed HTTPS)

When targeting a local Docker Compose dev stack that uses a self-signed certificate, add `"MILEPOINT_INSECURE_TLS": "true"` to `env`:

```json
{
  "mcpServers": {
    "milepoint-dev": {
      "command": "node",
      "args": ["/path/to/Milepoint/mcp/dist/index.js"],
      "env": {
        "MILEPOINT_URL": "https://localhost:8443",
        "MILEPOINT_API_KEY": "mp_your_dev_token_here",
        "MILEPOINT_INSECURE_TLS": "true"
      }
    }
  }
}
```
