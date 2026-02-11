import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { SpaceshipClient } from "../spaceship-client.js";
import { normalizeDomain } from "../dns-utils.js";
import { toTextResult, toErrorResult } from "../tool-result.js";

export const registerDomainManagementTools = (server: McpServer, client: SpaceshipClient): void => {
  server.registerTool(
    "list_domains",
    {
      title: "List Domains",
      description: "List all domains in the Spaceship account.",
      annotations: { readOnlyHint: true, openWorldHint: true },

      inputSchema: z.object({
        fetchAll: z.boolean().default(true).describe("Fetch all pages."),
        take: z.number().int().min(1).max(100).default(100).describe("Items per page when fetchAll=false."),
        skip: z.number().int().min(0).default(0).describe("Offset when fetchAll=false."),
        orderBy: z.enum(["name", "-name", "unicodeName", "-unicodeName", "registrationDate", "-registrationDate", "expirationDate", "-expirationDate"]).optional().describe("Sort order. Prefix with '-' for descending."),
      }),
    },
    async ({ fetchAll, take, skip, orderBy }) => {
      try {
        if (fetchAll) {
          const domains = await client.listAllDomains(orderBy);
          return toTextResult(
            [
              `Total domains: ${domains.length}`,
              ...domains.map((d) => `  - ${d.name}${d.expirationDate ? ` (expires: ${d.expirationDate})` : ""}`),
            ].join("\n"),
            { count: domains.length, domains },
          );
        }

        const response = await client.listDomains({ take, skip, orderBy });
        return toTextResult(
          [
            `Total: ${response.total}, showing ${response.items.length} (skip: ${skip})`,
            ...response.items.map((d) => `  - ${d.name}`),
          ].join("\n"),
          { total: response.total, items: response.items } as Record<string, unknown>,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "get_domain",
    {
      title: "Get Domain Details",
      description: "Get detailed information about a specific domain including registration/expiration dates, auto-renewal status, privacy protection level, nameservers, lifecycle status, and contacts.",
      annotations: { readOnlyHint: true, openWorldHint: true },

      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name"),
      }),
    },
    async ({ domain }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        const info = await client.getDomain(normalizedDomain);

        return toTextResult(
          [
            `Domain: ${info.name}`,
            info.registrationDate ? `Registered: ${info.registrationDate}` : null,
            info.expirationDate ? `Expires: ${info.expirationDate}` : null,
            info.autoRenew !== undefined ? `Auto-renew: ${info.autoRenew}` : null,
            info.lifecycleStatus ? `Lifecycle: ${info.lifecycleStatus}` : null,
            info.verificationStatus ? `Verification: ${info.verificationStatus}` : null,
            info.privacyProtection?.level ? `Privacy: ${info.privacyProtection.level}` : null,
            info.nameservers?.hosts ? `Nameservers: ${info.nameservers.hosts.join(", ")}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          info,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "check_domain_availability",
    {
      title: "Check Domain Availability",
      description: "Check if one or more domains are available for registration and show pricing. Provide up to 20 domains to check at once.",
      annotations: { readOnlyHint: true, openWorldHint: true },

      inputSchema: z.object({
        domains: z
          .array(z.string().min(4).max(255))
          .min(1)
          .max(20)
          .describe("Domain name(s) to check"),
      }),
    },
    async ({ domains }) => {
      try {
        const formatResult = (r: { domain: string; available: boolean; premiumPricing?: { registerPrice?: number; currency?: string }[] }): string => {
          const pricing = r.premiumPricing?.[0];
          const priceStr = pricing?.registerPrice !== undefined
            ? ` (${pricing.currency ?? "USD"} ${pricing.registerPrice})`
            : "";
          return `${r.domain}: ${r.available ? "AVAILABLE" : "NOT AVAILABLE"}${priceStr}`;
        };

        if (domains.length === 1) {
          const result = await client.checkDomainAvailability(normalizeDomain(domains[0]));
          return toTextResult(formatResult(result), result);
        }

        const results = await client.checkDomainsAvailability(
          domains.map(normalizeDomain),
        );

        return toTextResult(
          results.map(formatResult).join("\n"),
          { results } as Record<string, unknown>,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "update_nameservers",
    {
      title: "Update Nameservers",
      description:
        "Update the nameservers for a domain. This replaces ALL current nameservers with the provided list. " +
        'Set provider to "basic" to switch to Spaceship\'s built-in DNS (nameservers list is ignored). ' +
        'Set provider to "custom" (default) to use external nameservers. ' +
        "WARNING: Changing nameservers affects DNS resolution for ALL services on this domain and may cause extended downtime if misconfigured. " +
        "Always confirm with the user before calling this tool and use get_domain first to check current nameservers.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },

      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name"),
        provider: z
          .enum(["basic", "custom"])
          .default("custom")
          .describe('"basic" for Spaceship built-in DNS, "custom" for external nameservers'),
        nameservers: z
          .array(z.string().min(1))
          .max(6)
          .default([])
          .describe('List of nameserver hostnames (required for "custom" provider, ignored for "basic")'),
      }),
    },
    async ({ domain, provider, nameservers }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        await client.updateNameservers(normalizedDomain, nameservers, provider);

        if (provider === "basic") {
          return toTextResult(
            `Successfully switched ${normalizedDomain} to Spaceship built-in DNS`,
          );
        }

        return toTextResult(
          `Successfully updated nameservers for ${normalizedDomain}: ${nameservers.join(", ")}`,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "set_auto_renew",
    {
      title: "Set Auto-Renew",
      description:
        "Enable or disable auto-renewal for a domain. " +
        "WARNING: Disabling auto-renewal risks losing the domain when it expires — the domain may become available for others to register. " +
        "Always confirm with the user before disabling auto-renewal.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },

      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name"),
        enabled: z.boolean().describe("Enable (true) or disable (false) auto-renewal"),
      }),
    },
    async ({ domain, enabled }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        await client.setAutoRenew(normalizedDomain, enabled);

        return toTextResult(
          `Auto-renewal ${enabled ? "enabled" : "disabled"} for ${normalizedDomain}`,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "set_transfer_lock",
    {
      title: "Set Transfer Lock",
      description:
        "Enable or disable transfer lock for a domain. " +
        "WARNING: Disabling the transfer lock makes the domain vulnerable to unauthorized transfers away from this account. " +
        "Only unlock when intentionally transferring the domain. Always confirm with the user before unlocking.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },

      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name"),
        locked: z.boolean().describe("Lock (true) or unlock (false) the domain"),
      }),
    },
    async ({ domain, locked }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        await client.setTransferLock(normalizedDomain, locked);

        return toTextResult(
          `Transfer lock ${locked ? "enabled" : "disabled"} for ${normalizedDomain}`,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "get_auth_code",
    {
      title: "Get Auth/EPP Code",
      description:
        "Retrieve the authorization/EPP code for domain transfer. " +
        "WARNING: The auth code is a sensitive credential — anyone with this code can initiate a domain transfer. " +
        "Never share the auth code publicly or log it in plain text. Always confirm with the user before retrieving.",
      annotations: { readOnlyHint: true, openWorldHint: true },

      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name"),
      }),
    },
    async ({ domain }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        const result = await client.getAuthCode(normalizedDomain);

        return toTextResult(
          [
            `Auth code for ${normalizedDomain}: ${result.authCode}`,
            result.expires ? `Expires: ${result.expires}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          result as unknown as Record<string, unknown>,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );
};
