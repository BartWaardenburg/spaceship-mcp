import { z } from "zod/v4";
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpaceshipClient } from "./spaceship-client.js";

const DNS_RECORD_TYPES = [
  "A", "AAAA", "CNAME", "MX", "TXT", "NS",
  "SRV", "CAA", "ALIAS", "HTTPS", "SVCB", "PTR", "TLSA",
];

const PRIVACY_LEVELS = ["high", "public"];

const NAMESERVER_PROVIDERS = ["basic", "custom"];

const domainCompleter = (client: SpaceshipClient) =>
  async (value: string): Promise<string[]> => {
    try {
      const domains = await client.listAllDomains();
      return domains
        .map((d) => d.name)
        .filter((name) => name.toLowerCase().startsWith(value.toLowerCase()));
    } catch {
      return [];
    }
  };

const staticCompleter = (options: string[]) =>
  (value: string | undefined): string[] =>
    options.filter((o) => o.toLowerCase().startsWith((value ?? "").toLowerCase()));

export const registerCompletablePrompts = (server: McpServer, client: SpaceshipClient): void => {
  const completeDomain = domainCompleter(client);

  server.prompt(
    "domain-lookup",
    "Look up details for a domain",
    { domain: completable(z.string(), completeDomain) },
    async ({ domain }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Look up the domain "${domain}" using the get_domain tool and summarize its status, expiry date, nameservers, and privacy settings.`,
        },
      }],
    }),
  );

  server.prompt(
    "dns-records",
    "List DNS records for a domain, optionally filtered by type",
    {
      domain: completable(z.string(), completeDomain),
      type: completable(z.string().optional(), staticCompleter(DNS_RECORD_TYPES)),
    },
    async ({ domain, type }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: type
            ? `List all ${type} DNS records for "${domain}" using the list_dns_records tool.`
            : `List all DNS records for "${domain}" using the list_dns_records tool and organize them by type.`,
        },
      }],
    }),
  );

  server.prompt(
    "set-privacy",
    "Set privacy level for a domain",
    {
      domain: completable(z.string(), completeDomain),
      level: completable(z.string(), staticCompleter(PRIVACY_LEVELS)),
    },
    async ({ domain, level }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Set the privacy level for "${domain}" to "${level}" using the set_privacy_level tool with userConsent set to true.`,
        },
      }],
    }),
  );

  server.prompt(
    "update-nameservers",
    "Update nameservers for a domain",
    {
      domain: completable(z.string(), completeDomain),
      provider: completable(z.string(), staticCompleter(NAMESERVER_PROVIDERS)),
    },
    async ({ domain, provider }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: provider === "basic"
            ? `Reset the nameservers for "${domain}" back to the default Spaceship nameservers using the update_nameservers tool with provider "basic".`
            : `Update the nameservers for "${domain}" to custom nameservers. First ask the user which nameservers to use, then call the update_nameservers tool.`,
        },
      }],
    }),
  );
};
