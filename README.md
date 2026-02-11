# spaceship-mcp

[![npm version](https://img.shields.io/npm/v/spaceship-mcp.svg)](https://www.npmjs.com/package/spaceship-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)
[![CI](https://github.com/bartwaardenburg/spaceship-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/bartwaardenburg/spaceship-mcp/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/BartWaardenburg/6816ec0a7270dc8888a2e34f5bd5383b/raw/spaceship-mcp-coverage.json)](https://bartwaardenburg.github.io/spaceship-mcp/)
[![MCP](https://img.shields.io/badge/MCP-compatible-purple.svg)](https://modelcontextprotocol.io)

A community-built [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for the [Spaceship](https://spaceship.com) API. Manage domains, DNS records, contacts, marketplace listings, and more — all through natural language via any MCP-compatible AI client.

> **Note:** This is an unofficial, community-maintained project and is not affiliated with or endorsed by Spaceship.

## Features

- **48 tools** across 8 categories covering the full Spaceship API
- **13 DNS record types** with dedicated, type-safe creation tools (A, AAAA, ALIAS, CAA, CNAME, HTTPS, MX, NS, PTR, SRV, SVCB, TLSA, TXT)
- **Complete domain lifecycle** — register, renew, transfer, and restore domains
- **SellerHub integration** — list domains for sale and generate checkout links
- **DNS alignment analysis** — compare expected vs actual records to catch misconfigurations
- **WHOIS privacy and contact management** with TLD-specific attribute support
- **Input and output validation** via Zod schemas on every tool for safe, predictable operations
- **5 MCP Resources** for passive context loading (domain list, domain details, DNS records, contacts, SellerHub)
- **9 MCP Prompts** — 5 guided workflows and 4 with argument auto-complete
- **Resource subscriptions** with polling-based change detection and automatic notifications
- **Response caching** with configurable TTL and automatic invalidation on writes
- **Rate limit handling** with exponential backoff and `Retry-After` header support
- **Toolset filtering** to expose only the tool categories you need
- **Dynamic tool loading** mode for agents with constrained context windows
- **Actionable error messages** with context-aware recovery suggestions
- **Docker support** for containerized deployment
- **453 unit tests** with near-complete coverage

## Supported Clients

This MCP server works with any client that supports the Model Context Protocol, including:

| Client | Easiest install |
|---|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | One-liner: `claude mcp add` |
| [Codex CLI](https://github.com/openai/codex) (OpenAI) | One-liner: `codex mcp add` |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) (Google) | One-liner: `gemini mcp add` |
| [VS Code](https://code.visualstudio.com/) (Copilot) | Command Palette: `MCP: Add Server` |
| [Claude Desktop](https://claude.ai/download) | JSON config file |
| [Cursor](https://cursor.com) | JSON config file |
| [Windsurf](https://codeium.com/windsurf) | JSON config file |
| [Cline](https://github.com/cline/cline) | UI settings |
| [Zed](https://zed.dev) | JSON settings file |

## Installation

### Claude Code

```bash
claude mcp add --scope user spaceship-mcp \
  --env SPACESHIP_API_KEY=your-key \
  --env SPACESHIP_API_SECRET=your-secret \
  -- npx -y spaceship-mcp
```

### Codex CLI (OpenAI)

```bash
codex mcp add spaceship-mcp \
  --env SPACESHIP_API_KEY=your-key \
  --env SPACESHIP_API_SECRET=your-secret \
  -- npx -y spaceship-mcp
```

### Gemini CLI (Google)

```bash
gemini mcp add spaceship-mcp -- npx -y spaceship-mcp
```

Set environment variables `SPACESHIP_API_KEY` and `SPACESHIP_API_SECRET` separately via `~/.gemini/settings.json`.

### VS Code (Copilot)

Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) > `MCP: Add Server` > select **Command (stdio)**.

Or add to `.vscode/mcp.json` in your project directory:

```json
{
  "servers": {
    "spaceship-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "spaceship-mcp"],
      "env": {
        "SPACESHIP_API_KEY": "your-key",
        "SPACESHIP_API_SECRET": "your-secret"
      }
    }
  }
}
```

### Claude Desktop / Cursor / Windsurf / Cline

These clients share the same JSON format. Add the config below to the appropriate file:

| Client | Config file |
|---|---|
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Cursor (project) | `.cursor/mcp.json` |
| Cursor (global) | `~/.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Cline | Settings > MCP Servers > Edit |

```json
{
  "mcpServers": {
    "spaceship-mcp": {
      "command": "npx",
      "args": ["-y", "spaceship-mcp"],
      "env": {
        "SPACESHIP_API_KEY": "your-key",
        "SPACESHIP_API_SECRET": "your-secret"
      }
    }
  }
}
```

### Zed

Add to your Zed settings (`~/.zed/settings.json` on macOS, `~/.config/zed/settings.json` on Linux):

```json
{
  "context_servers": {
    "spaceship-mcp": {
      "command": "npx",
      "args": ["-y", "spaceship-mcp"],
      "env": {
        "SPACESHIP_API_KEY": "your-key",
        "SPACESHIP_API_SECRET": "your-secret"
      }
    }
  }
}
```

### Docker

```bash
docker run -i --rm \
  -e SPACESHIP_API_KEY=your-key \
  -e SPACESHIP_API_SECRET=your-secret \
  ghcr.io/bartwaardenburg/spaceship-mcp
```

### Codex CLI (TOML config alternative)

If you prefer editing `~/.codex/config.toml` directly:

```toml
[mcp_servers.spaceship-mcp]
command = "npx"
args = ["-y", "spaceship-mcp"]
env = { "SPACESHIP_API_KEY" = "your-key", "SPACESHIP_API_SECRET" = "your-secret" }
```

### Other MCP Clients

For any MCP-compatible client, use this server configuration:

- **Command:** `npx`
- **Args:** `["-y", "spaceship-mcp"]`
- **Environment variables:** `SPACESHIP_API_KEY` and `SPACESHIP_API_SECRET`

## Configuration

### Required

| Variable | Description |
|---|---|
| `SPACESHIP_API_KEY` | Your Spaceship API key |
| `SPACESHIP_API_SECRET` | Your Spaceship API secret |

Generate your credentials in the [Spaceship API Manager](https://www.spaceship.com/application/api-manager/).

### Optional

| Variable | Description | Default |
|---|---|---|
| `SPACESHIP_CACHE_TTL` | Response cache lifetime in seconds. Set to `0` to disable caching. | `120` |
| `SPACESHIP_MAX_RETRIES` | Maximum retry attempts for rate-limited (429) requests with exponential backoff. | `3` |
| `SPACESHIP_TOOLSETS` | Comma-separated list of tool categories to enable (see [Toolset Filtering](#toolset-filtering)). | All toolsets |
| `SPACESHIP_DYNAMIC_TOOLS` | Set to `true` to enable dynamic tool loading mode (see [Dynamic Tool Loading](#dynamic-tool-loading)). | `false` |

## API Key Setup

### Creating Your API Key

1. Log in to your [Spaceship account](https://www.spaceship.com)
2. Navigate to **API Manager** ([direct link](https://www.spaceship.com/application/api-manager/))
3. Click **New API key**
4. Give the key a descriptive name (e.g. "MCP Server")
5. Select the scopes you need (see below)
6. Copy both the **API key** and **API secret** — the secret is only shown once

### Available Scopes

Each scope controls access to a specific part of the Spaceship API. When creating your key, enable only the scopes you need.

| Scope | Access |
|---|---|
| `domains:read` | List domains, check availability, view domain details and settings |
| `domains:write` | Modify domain settings (nameservers, auto-renew, contacts, privacy) |
| `domains:billing` | Register, renew, restore, and transfer domains (financial operations) |
| `domains:transfer` | Transfer lock, auth codes, and transfer status |
| `contacts:read` | Read saved contact profiles and attributes |
| `contacts:write` | Create and update contact profiles and attributes |
| `dnsrecords:read` | List DNS records for your domains |
| `dnsrecords:write` | Create, update, and delete DNS records |
| `sellerhub:read` | View marketplace listings and verification records |
| `sellerhub:write` | List/delist domains for sale, update pricing, generate checkout links |
| `asyncoperations:read` | Poll status of async operations (registration, renewal, transfer) |

### Scopes Per Feature

The table below shows which scopes are required for each group of tools.

| Feature | Tools | Required scopes |
|---|---|---|
| **DNS Records** | `list_dns_records` | `dnsrecords:read` |
| | `save_dns_records`, `delete_dns_records`, all `create_*_record` tools | `dnsrecords:read` `dnsrecords:write` |
| **Domain Info** | `list_domains`, `get_domain`, `check_domain_availability` | `domains:read` |
| **Domain Settings** | `update_nameservers`, `set_auto_renew`, `set_privacy_level`, `set_email_protection`, `update_domain_contacts` | `domains:write` |
| **Domain Lifecycle** | `register_domain`, `renew_domain`, `restore_domain`, `transfer_domain` | `domains:billing` |
| **Transfer** | `set_transfer_lock`, `get_auth_code`, `get_transfer_status` | `domains:transfer` |
| **Contacts** | `get_contact`, `get_contact_attributes` | `contacts:read` |
| | `save_contact`, `save_contact_attributes` | `contacts:write` |
| **Personal NS** | `list_personal_nameservers`, `get_personal_nameserver` | `domains:read` |
| | `update_personal_nameserver`, `delete_personal_nameserver` | `domains:write` |
| **SellerHub** | `list_sellerhub_domains`, `get_sellerhub_domain`, `get_verification_records` | `sellerhub:read` |
| | `create_sellerhub_domain`, `update_sellerhub_domain`, `delete_sellerhub_domain`, `create_checkout_link` | `sellerhub:write` |
| **Async Operations** | `get_async_operation` | `asyncoperations:read` |
| **Analysis** | `check_dns_alignment` | `dnsrecords:read` |

### Recommended Scope Presets

**Full access** — enable everything for unrestricted use:

```
domains:read  domains:write  domains:billing  domains:transfer
contacts:read  contacts:write
dnsrecords:read  dnsrecords:write
sellerhub:read  sellerhub:write
asyncoperations:read
```

**DNS management only** — just read/write DNS records:

```
dnsrecords:read  dnsrecords:write
```

**Read-only** — browse domains and records without making changes:

```
domains:read  contacts:read  dnsrecords:read  sellerhub:read  asyncoperations:read
```

## Available Tools

### DNS Records

| Tool | Description |
|---|---|
| `list_dns_records` | List all DNS records for a domain with pagination |
| `save_dns_records` | Save (upsert) DNS records — replaces records with the same name and type |
| `delete_dns_records` | Delete DNS records by name and type |

### Type-Specific Record Creation

Each DNS record type has a dedicated tool with type-safe parameters and validation.

| Tool | Description |
|---|---|
| `create_a_record` | Create an A record (IPv4 address) |
| `create_aaaa_record` | Create an AAAA record (IPv6 address) |
| `create_alias_record` | Create an ALIAS record (CNAME flattening at zone apex) |
| `create_caa_record` | Create a CAA record (Certificate Authority Authorization) |
| `create_cname_record` | Create a CNAME record (canonical name) |
| `create_https_record` | Create an HTTPS record (SVCB-compatible) |
| `create_mx_record` | Create an MX record (mail exchange) |
| `create_ns_record` | Create an NS record (nameserver delegation) |
| `create_ptr_record` | Create a PTR record (reverse DNS) |
| `create_srv_record` | Create an SRV record (service locator) |
| `create_svcb_record` | Create an SVCB record (general service binding) |
| `create_tlsa_record` | Create a TLSA record (DANE/TLS certificate association) |
| `create_txt_record` | Create a TXT record (text data) |

### Domain Management

| Tool | Description |
|---|---|
| `list_domains` | List all domains in the account with pagination |
| `get_domain` | Get detailed domain information |
| `check_domain_availability` | Check availability for up to 20 domains at once |
| `update_nameservers` | Update nameservers for a domain |
| `set_auto_renew` | Toggle auto-renewal for a domain |
| `set_transfer_lock` | Toggle transfer lock for a domain |
| `get_auth_code` | Get the transfer auth/EPP code |

### Domain Lifecycle

| Tool | Description |
|---|---|
| `register_domain` | Register a new domain (financial operation, async) |
| `renew_domain` | Renew a domain registration (financial operation, async) |
| `restore_domain` | Restore a domain from redemption grace period (financial operation, async) |
| `transfer_domain` | Transfer a domain to Spaceship (financial operation, async) |
| `get_transfer_status` | Check the status of a domain transfer |
| `get_async_operation` | Poll the status of an async operation by its operation ID |

### Contacts & Privacy

| Tool | Description |
|---|---|
| `save_contact` | Create or update a reusable contact profile |
| `get_contact` | Retrieve a saved contact by ID |
| `save_contact_attributes` | Save TLD-specific contact attributes (e.g. tax IDs) |
| `get_contact_attributes` | Retrieve all stored contact attributes |
| `update_domain_contacts` | Update domain contacts (registrant, admin, tech, billing) |
| `set_privacy_level` | Set WHOIS privacy level (high or public) |
| `set_email_protection` | Toggle contact form display in WHOIS |

### Personal Nameservers

| Tool | Description |
|---|---|
| `list_personal_nameservers` | List vanity/glue nameservers for a domain |
| `get_personal_nameserver` | Get details of a personal nameserver by hostname |
| `update_personal_nameserver` | Create or update a personal nameserver (glue record) |
| `delete_personal_nameserver` | Delete a personal nameserver |

### SellerHub

| Tool | Description |
|---|---|
| `list_sellerhub_domains` | List domains for sale on the marketplace |
| `create_sellerhub_domain` | List a domain for sale with pricing |
| `get_sellerhub_domain` | Get listing details |
| `update_sellerhub_domain` | Update listing display name, description, and pricing |
| `delete_sellerhub_domain` | Remove a listing from the marketplace |
| `create_checkout_link` | Generate a buy-now checkout link for a listing |
| `get_verification_records` | Get DNS verification records for a listing |

### Analysis

| Tool | Description |
|---|---|
| `check_dns_alignment` | Compare expected vs actual DNS records to detect missing or unexpected entries |

## MCP Resources

Resources provide passive context that clients can load without calling tools.

| Resource | URI | Description |
|---|---|---|
| Domain List | `spaceship://domains` | All domains in the account |
| Domain Details | `spaceship://domains/{domain}` | Detailed info for a specific domain |
| DNS Records | `spaceship://domains/{domain}/dns` | DNS records for a specific domain |
| Domain Contacts | `spaceship://domains/{domain}/contacts` | Contact assignments for a domain |
| SellerHub Listings | `spaceship://sellerhub` | All SellerHub marketplace listings |

Clients that support resource subscriptions will receive automatic notifications when data changes (polled every 30 seconds).

## MCP Prompts

Prompts provide guided workflows that clients can present as slash commands or quick actions.

### Guided Workflows

| Prompt | Description |
|---|---|
| `setup-domain` | Register and configure a new domain (availability check, registration, DNS, privacy) |
| `audit-domain` | Health check for an existing domain (status, DNS, privacy, auto-renew, contacts) |
| `setup-email` | Configure email DNS records for Google Workspace, Microsoft 365, Fastmail, or a custom provider |
| `migrate-dns` | Step-by-step guide to migrate DNS records to Spaceship |
| `list-for-sale` | List a domain on the SellerHub marketplace with pricing and checkout link |

### Auto-Complete Prompts

These prompts support argument auto-complete for domain names and common values:

| Prompt | Description |
|---|---|
| `domain-lookup` | Look up domain details with domain name auto-complete |
| `dns-records` | List DNS records with domain and record type auto-complete |
| `set-privacy` | Set WHOIS privacy with domain and level auto-complete |
| `update-nameservers` | Update nameservers with domain and provider auto-complete |

## Toolset Filtering

Reduce context window usage by enabling only the tool categories you need. Set the `SPACESHIP_TOOLSETS` environment variable to a comma-separated list:

```bash
SPACESHIP_TOOLSETS=dns,domains
```

| Toolset | Tools included |
|---|---|
| `domains` | Domain management and lifecycle tools |
| `dns` | DNS records, record creators, and analysis |
| `contacts` | Contact and privacy management |
| `privacy` | Privacy management (same tools as `contacts`) |
| `nameservers` | Personal nameserver management |
| `sellerhub` | SellerHub marketplace tools |
| `availability` | Domain availability checking |

When not set, all toolsets are enabled. Invalid names are ignored; if all names are invalid, all toolsets are enabled as a fallback.

## Dynamic Tool Loading

For agents with constrained context windows, dynamic mode replaces all 48 tools with 3 lightweight meta-tools:

```bash
SPACESHIP_DYNAMIC_TOOLS=true
```

| Meta-Tool | Description |
|---|---|
| `search_tools` | Search available tools by keyword to discover what's available |
| `describe_tools` | Get full parameter schemas for one or more tools before executing |
| `execute_tool` | Execute any Spaceship tool by name with arguments |

**Workflow:**

1. `search_tools({ query: "dns" })` — discover relevant tools
2. `describe_tools({ tools: ["create_a_record"] })` — get the full parameter schema
3. `execute_tool({ tool: "create_a_record", arguments: { ... } })` — execute

Resources, prompts, and completions remain available in dynamic mode.

## Example Usage

Once connected, you can interact with the Spaceship API using natural language:

- "List all my domains"
- "Check if example.com is available for registration"
- "Create an A record for api.example.com pointing to 203.0.113.10"
- "Set up MX records for example.com to use Google Workspace"
- "Enable WHOIS privacy on example.com"
- "Check if my DNS records for example.com match what I expect"
- "List my domains for sale on SellerHub"
- "Transfer example.com to Spaceship"

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck
```

### Project Structure

```
src/
  index.ts                    # Entry point (stdio transport)
  server.ts                   # MCP server setup, toolset filtering, feature registration
  spaceship-client.ts         # Spaceship API HTTP client with caching and retry
  cache.ts                    # TTL-based in-memory response cache
  schemas.ts                  # Shared Zod validation schemas
  output-schemas.ts           # Zod output schemas for all 48 tools
  types.ts                    # TypeScript interfaces
  tool-result.ts              # Error formatting with recovery suggestions
  resources.ts                # MCP Resources (5 resources)
  resource-subscriptions.ts   # Polling-based resource change notifications
  prompts.ts                  # MCP Prompts (5 guided workflows)
  completions.ts              # MCP Prompts with argument auto-complete (4 prompts)
  dynamic-tools.ts            # Dynamic tool loading meta-tools
  dns-utils.ts                # DNS record formatting utilities
  update-checker.ts           # NPM update notifications
  tools/
    dns-records.ts            # List, save, delete DNS records
    dns-record-creators.ts    # 13 type-specific DNS record creation tools
    domain-management.ts      # Domain listing, settings, nameservers
    domain-lifecycle.ts       # Registration, renewal, transfer, restore
    contacts-privacy.ts       # Contact profiles and WHOIS privacy
    personal-nameservers.ts   # Vanity/glue nameserver management
    sellerhub.ts              # Marketplace listing and checkout tools
    analysis.ts               # DNS alignment analysis
```

## Requirements

- Node.js >= 20
- A [Spaceship](https://spaceship.com) account with API credentials

## License

MIT - see [LICENSE](LICENSE) for details.
