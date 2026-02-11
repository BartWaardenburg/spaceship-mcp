import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { SpaceshipClient } from "../spaceship-client.js";
import { normalizeDomain } from "../dns-utils.js";
import { toTextResult, toErrorResult } from "../tool-result.js";
import {
  listPersonalNameserversOutput, getPersonalNameserverOutput,
  updatePersonalNameserverOutput, deletePersonalNameserverOutput,
} from "../output-schemas.js";

export const registerPersonalNameserverTools = (server: McpServer, client: SpaceshipClient): void => {
  server.registerTool(
    "list_personal_nameservers",
    {
      title: "List Personal Nameservers",
      description:
        "List personal (vanity) nameservers configured for a domain (e.g. ns1.yourdomain.com, ns2.yourdomain.com).",
      annotations: { readOnlyHint: true, openWorldHint: true },
      outputSchema: listPersonalNameserversOutput,
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name to list personal nameservers for."),
      }),
    },
    async ({ domain }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        const nameservers = await client.listPersonalNameservers(normalizedDomain);

        if (nameservers.length === 0) {
          return toTextResult(`No personal nameservers configured for ${normalizedDomain}`);
        }

        return toTextResult(
          [
            `Personal nameservers for ${normalizedDomain}:`,
            ...nameservers.map(
              (ns) => `  - ${ns.host}${ns.ips?.length ? ` (${ns.ips.join(", ")})` : ""}`,
            ),
          ].join("\n"),
          { nameservers } as Record<string, unknown>,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "get_personal_nameserver",
    {
      title: "Get Personal Nameserver",
      description:
        "Get details of a single personal (vanity) nameserver by hostname, including its IP addresses.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      outputSchema: getPersonalNameserverOutput,
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The parent domain name."),
        host: z.string().min(1).describe('The nameserver hostname (e.g. "ns1.yourdomain.com").'),
      }),
    },
    async ({ domain, host }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        const ns = await client.getPersonalNameserver(normalizedDomain, host);
        return toTextResult(
          `Personal nameserver: ${ns.host}${ns.ips?.length ? ` (${ns.ips.join(", ")})` : ""}`,
          ns as unknown as Record<string, unknown>,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "update_personal_nameserver",
    {
      title: "Update Personal Nameserver",
      description:
        "Create or update a personal nameserver host with its IP addresses. These are glue records that map a nameserver hostname (e.g. ns1.yourdomain.com) to IP addresses at the registry level.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      outputSchema: updatePersonalNameserverOutput,
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The parent domain name."),
        host: z.string().min(1).describe("The nameserver hostname (e.g. \"ns1.yourdomain.com\")."),
        ips: z.array(z.string().min(1)).min(1).describe("Array of IP addresses for the nameserver glue record."),
      }),
    },
    async ({ domain, host, ips }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        await client.updatePersonalNameserver(normalizedDomain, host, ips);

        return toTextResult(
          `Updated personal nameserver ${host} for ${normalizedDomain} with IPs: ${ips.join(", ")}`,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "delete_personal_nameserver",
    {
      title: "Delete Personal Nameserver",
      description:
        "Delete a personal nameserver host from a domain. This removes the glue record at the registry. " +
        "WARNING: If this nameserver is actively used by any domain, those domains will lose DNS resolution and experience downtime. " +
        "Always confirm with the user before calling this tool.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      outputSchema: deletePersonalNameserverOutput,
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The parent domain name."),
        host: z.string().min(1).describe("The nameserver hostname to delete (e.g. \"ns1.yourdomain.com\")."),
      }),
    },
    async ({ domain, host }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        await client.deletePersonalNameserver(normalizedDomain, host);

        return toTextResult(
          `Deleted personal nameserver ${host} from ${normalizedDomain}`,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );
};
