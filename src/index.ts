#!/usr/bin/env node

import { createRequire } from "node:module";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { SpaceshipClient } from "./spaceship-client.js";
import { createServer, parseToolsets } from "./server.js";
import { checkForUpdate } from "./update-checker.js";

const require = createRequire(import.meta.url);
const { name, version } = require("../package.json") as { name: string; version: string };

const apiKey = process.env.SPACESHIP_API_KEY;
const apiSecret = process.env.SPACESHIP_API_SECRET;

if (!apiKey || !apiSecret) {
  console.error("Missing required env vars: SPACESHIP_API_KEY and SPACESHIP_API_SECRET");
  process.exit(1);
}

const cacheTtl = process.env.SPACESHIP_CACHE_TTL !== undefined
  ? parseInt(process.env.SPACESHIP_CACHE_TTL, 10) * 1000
  : undefined;
const maxRetries = process.env.SPACESHIP_MAX_RETRIES !== undefined
  ? parseInt(process.env.SPACESHIP_MAX_RETRIES, 10)
  : 3;
const client = new SpaceshipClient(apiKey, apiSecret, undefined, cacheTtl, { maxRetries });
const toolsets = parseToolsets(process.env.SPACESHIP_TOOLSETS);

// serveStdio serves 2026-07-28 clients and clients that open with the 2025 handshake.
serveStdio(() => createServer(client, toolsets), {
  onerror: (error) => console.error("Spaceship MCP server error:", error),
});

// Do not wait for the update check: the server must start at once.
void checkForUpdate(name, version);
