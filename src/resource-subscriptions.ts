import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { SpaceshipClient } from "./spaceship-client.js";

const POLL_INTERVAL_MS = 30_000;

interface SubscriptionState {
  lastHash: string;
  timer: ReturnType<typeof setInterval>;
}

const hashData = (data: unknown): string => {
  const json = JSON.stringify(data, Object.keys(data as Record<string, unknown>).sort());
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    hash = ((hash << 5) - hash + json.charCodeAt(i)) | 0;
  }
  return String(hash);
};

export const registerResourceSubscriptions = (
  server: McpServer,
  client: SpaceshipClient,
): (() => void) => {
  const subscriptions = new Map<string, SubscriptionState>();

  // Register domain list resource
  server.resource(
    "domains-list",
    "spaceship://domains",
    { description: "List of all domains in the account" },
    async (uri) => {
      const domains = await client.listAllDomains();
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(domains, null, 2),
        }],
      };
    },
  );

  // Register domain detail resource template
  server.resource(
    "domain-detail",
    new ResourceTemplate("spaceship://domains/{domain}", { list: undefined }),
    { description: "Domain details including status, expiry, and nameservers" },
    async (uri, params) => {
      const domain = await client.getDomain(params.domain as string);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(domain, null, 2),
        }],
      };
    },
  );

  // Register DNS records resource template
  server.resource(
    "domain-dns",
    new ResourceTemplate("spaceship://domains/{domain}/dns", { list: undefined }),
    { description: "DNS records for a domain" },
    async (uri, params) => {
      const records = await client.listAllDnsRecords(params.domain as string);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(records, null, 2),
        }],
      };
    },
  );

  const startPolling = (resourceUri: string, fetcher: () => Promise<unknown>): void => {
    if (subscriptions.has(resourceUri)) return;

    const poll = async (): Promise<void> => {
      try {
        const data = await fetcher();
        const newHash = hashData(data);
        const state = subscriptions.get(resourceUri);
        if (state && state.lastHash !== newHash) {
          state.lastHash = newHash;
          void server.server.sendResourceUpdated({ uri: resourceUri });
        }
      } catch {
        // Silently skip poll errors
      }
    };

    // Set initial hash
    void fetcher().then((data) => {
      subscriptions.set(resourceUri, {
        lastHash: hashData(data),
        timer: setInterval(() => void poll(), POLL_INTERVAL_MS),
      });
    }).catch(() => {
      // If initial fetch fails, still start polling
      subscriptions.set(resourceUri, {
        lastHash: "",
        timer: setInterval(() => void poll(), POLL_INTERVAL_MS),
      });
    });
  };

  const stopPolling = (resourceUri: string): void => {
    const state = subscriptions.get(resourceUri);
    if (state) {
      clearInterval(state.timer);
      subscriptions.delete(resourceUri);
    }
  };

  // Handle subscribe/unsubscribe via the low-level server
  server.server.setRequestHandler(
    SubscribeRequestSchema,
    async (request) => {
      const uri = request.params.uri;

      if (uri === "spaceship://domains") {
        startPolling(uri, () => client.listAllDomains());
      } else if (uri.startsWith("spaceship://domains/") && uri.endsWith("/dns")) {
        const domain = uri.replace("spaceship://domains/", "").replace("/dns", "");
        startPolling(uri, () => client.listAllDnsRecords(domain));
      } else if (uri.startsWith("spaceship://domains/")) {
        const domain = uri.replace("spaceship://domains/", "");
        startPolling(uri, () => client.getDomain(domain));
      }

      return {};
    },
  );

  server.server.setRequestHandler(
    UnsubscribeRequestSchema,
    async (request) => {
      stopPolling(request.params.uri);
      return {};
    },
  );

  // Return cleanup function
  return () => {
    for (const [uri] of subscriptions) {
      stopPolling(uri);
    }
  };
};
