# Spaceship MCP Check Server

Read/check-focused MCP server for Spaceship DNS. This server is intentionally non-destructive and does not write DNS records.

## Why this exists

- Uses the current MCP TypeScript SDK patterns (`McpServer` + `registerTool` + stdio transport)
- Implements Spaceship DNS requests according to official docs (`/v1/dns/records/{domain}` with required `take` and `skip`)
- Helps with Vercel -> Fly cutover planning while preserving non-web records

## Requirements

- Node.js 24+
- `SPACESHIP_API_KEY`
- `SPACESHIP_API_SECRET`

## Install

```bash
pnpm install
```

## Run

```bash
SPACESHIP_API_KEY=... \
SPACESHIP_API_SECRET=... \
pnpm dev
```

## Exposed tools

- `list_dns_records`
- `check_dns_alignment`
- `analyze_fly_cutover`

## MCP client config (example)

```json
{
  "mcpServers": {
    "spaceship-check": {
      "command": "pnpm",
      "args": ["dev"],
      "cwd": "/Users/bartwaardenburg/Sites/spaceship-mcp-check",
      "env": {
        "SPACESHIP_API_KEY": "YOUR_KEY",
        "SPACESHIP_API_SECRET": "YOUR_SECRET"
      }
    }
  }
}
```

## Notes

- `analyze_fly_cutover` only proposes upserts/deletes for `@` and `www` web records (`A`, `AAAA`, `CNAME`, `ALIAS`)
- Non-web records (mail/auth/etc.) are not modified
- Detection of "likely Vercel" records is heuristic-based
