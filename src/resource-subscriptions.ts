import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

export const hashData = (data: unknown): string => {
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

    void fetcher().then((data) => {
      subscriptions.set(resourceUri, {
        lastHash: hashData(data),
        timer: setInterval(() => void poll(), POLL_INTERVAL_MS),
      });
    }).catch(() => {
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

  return () => {
    for (const [uri] of subscriptions) {
      stopPolling(uri);
    }
  };
};
