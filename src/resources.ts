import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpaceshipClient } from "./spaceship-client.js";
import { extractComparableFields } from "./dns-utils.js";

export const registerResources = (server: McpServer, client: SpaceshipClient): void => {
  // Static resource: list all domains
  server.registerResource(
    "domains",
    "spaceship://domains",
    {
      description: "List of all domains in the Spaceship account with status and expiration dates",
      mimeType: "application/json",
    },
    async () => {
      const domains = await client.listAllDomains();
      return {
        contents: [{
          uri: "spaceship://domains",
          mimeType: "application/json",
          text: JSON.stringify(domains, null, 2),
        }],
      };
    },
  );

  // Dynamic resource: domain details
  server.registerResource(
    "domain-details",
    new ResourceTemplate("spaceship://domains/{domain}", { list: undefined }),
    {
      description: "Detailed information about a specific domain including status, expiry, nameservers, and privacy settings",
      mimeType: "application/json",
    },
    async (uri, { domain }) => {
      const info = await client.getDomain(domain as string);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(info, null, 2),
        }],
      };
    },
  );

  // Dynamic resource: DNS records for a domain
  server.registerResource(
    "domain-dns",
    new ResourceTemplate("spaceship://domains/{domain}/dns", { list: undefined }),
    {
      description: "All DNS records configured for a domain",
      mimeType: "application/json",
    },
    async (uri, { domain }) => {
      const records = await client.listAllDnsRecords(domain as string);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(records.map(extractComparableFields), null, 2),
        }],
      };
    },
  );

  // Dynamic resource: domain contacts
  server.registerResource(
    "domain-contacts",
    new ResourceTemplate("spaceship://domains/{domain}/contacts", { list: undefined }),
    {
      description: "Contact configuration for a domain",
      mimeType: "application/json",
    },
    async (uri, { domain }) => {
      const info = await client.getDomain(domain as string);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(info.contacts ?? {}, null, 2),
        }],
      };
    },
  );

  // Static resource: SellerHub listings
  server.registerResource(
    "sellerhub",
    "spaceship://sellerhub",
    {
      description: "SellerHub marketplace listings overview",
      mimeType: "application/json",
    },
    async () => {
      const domains = await client.listAllSellerHubDomains();
      return {
        contents: [{
          uri: "spaceship://sellerhub",
          mimeType: "application/json",
          text: JSON.stringify(domains, null, 2),
        }],
      };
    },
  );
};
