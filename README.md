# spaceship-mcp

An MCP (Model Context Protocol) server for managing domains and DNS records via the [Spaceship](https://spaceship.com) API. Provides tools for DNS record management, domain administration, and DNS analysis through any MCP-compatible client.

## Installation

### Claude Code

```bash
claude mcp add spaceship-mcp -e SPACESHIP_API_KEY=your-key -e SPACESHIP_API_SECRET=your-secret -- npx spaceship-mcp
```

### Manual Configuration

Add the following to your MCP client configuration:

```json
{
  "mcpServers": {
    "spaceship-mcp": {
      "command": "npx",
      "args": ["spaceship-mcp"],
      "env": {
        "SPACESHIP_API_KEY": "your-key",
        "SPACESHIP_API_SECRET": "your-secret"
      }
    }
  }
}
```

## Configuration

Two environment variables are required:

| Variable | Description |
|---|---|
| `SPACESHIP_API_KEY` | Your Spaceship API key |
| `SPACESHIP_API_SECRET` | Your Spaceship API secret |

You can obtain API credentials from your [Spaceship](https://spaceship.com) account.

## Available Tools

### DNS Records

| Tool | Description |
|---|---|
| `list_dns_records` | List all DNS records for a domain |
| `create_dns_record` | Create DNS records (supports all types) |
| `update_dns_records` | Update existing DNS records |
| `delete_dns_records` | Delete DNS records by name and type |

### Type-Specific Record Creation

| Tool | Description |
|---|---|
| `create_a_record` | Create an A record (IPv4) |
| `create_aaaa_record` | Create an AAAA record (IPv6) |
| `create_cname_record` | Create a CNAME record |
| `create_mx_record` | Create an MX record |
| `create_srv_record` | Create an SRV record |
| `create_txt_record` | Create a TXT record |

### Domain Management

| Tool | Description |
|---|---|
| `list_domains` | List all domains in the account |
| `get_domain` | Get domain details |
| `check_domain_availability` | Check domain availability |
| `update_nameservers` | Update nameservers |
| `set_auto_renew` | Toggle auto-renewal |
| `set_transfer_lock` | Toggle transfer lock |
| `get_auth_code` | Get transfer auth/EPP code |

### Analysis

| Tool | Description |
|---|---|
| `check_dns_alignment` | Compare expected vs actual DNS records |
| `analyze_fly_cutover` | Analyze DNS for Vercel-to-Fly migration |

## Requirements

- Node.js >= 20

## License

MIT
