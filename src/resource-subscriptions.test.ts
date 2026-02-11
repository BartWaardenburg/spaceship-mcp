import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { createServer } from "./server.js";
import type { SpaceshipClient } from "./spaceship-client.js";
import { hashData, registerResourceSubscriptions } from "./resource-subscriptions.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const makeMockClient = (): SpaceshipClient =>
  ({
    listAllDomains: vi.fn().mockResolvedValue([{ name: "example.com" }]),
    listAllDnsRecords: vi.fn().mockResolvedValue([{ type: "A", name: "@", address: "1.2.3.4" }]),
    getDomain: vi.fn().mockResolvedValue({ name: "example.com", status: "active" }),
    listAllSellerHubDomains: vi.fn().mockResolvedValue([]),
  }) as unknown as SpaceshipClient;

describe("hashData", () => {
  it("returns consistent hash for same data", () => {
    const data = { a: 1, b: 2 };
    expect(hashData(data)).toBe(hashData(data));
  });

  it("returns different hash for different data", () => {
    expect(hashData({ a: 1 })).not.toBe(hashData({ a: 2 }));
  });
});

describe("registerResourceSubscriptions", () => {
  type RequestHandler = (request: { params: { uri: string } }) => Promise<Record<string, never>>;
  let subscribeHandler: RequestHandler;
  let unsubscribeHandler: RequestHandler;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const setupWithHandlers = (client?: SpaceshipClient): { cleanup: () => void; client: SpaceshipClient } => {
    const mcpServer = new McpServer({ name: "test", version: "1.0.0" });
    const mockClient = client ?? makeMockClient();

    const origSetRequestHandler = mcpServer.server.setRequestHandler.bind(mcpServer.server);
    vi.spyOn(mcpServer.server, "setRequestHandler").mockImplementation((schema: unknown, handler: unknown) => {
      if (schema === SubscribeRequestSchema) {
        subscribeHandler = handler as RequestHandler;
      } else if (schema === UnsubscribeRequestSchema) {
        unsubscribeHandler = handler as RequestHandler;
      }
      return origSetRequestHandler(schema as never, handler as never);
    });

    const cleanup = registerResourceSubscriptions(mcpServer, mockClient);
    return { cleanup, client: mockClient };
  };

  it("returns a cleanup function", () => {
    const { cleanup } = setupWithHandlers();
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("subscribe handler starts polling for domain list", async () => {
    const { cleanup, client } = setupWithHandlers();
    await subscribeHandler({ params: { uri: "spaceship://domains" } });
    await vi.advanceTimersByTimeAsync(0);
    expect((client.listAllDomains as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    cleanup();
  });

  it("subscribe handler starts polling for domain details", async () => {
    const { cleanup, client } = setupWithHandlers();
    await subscribeHandler({ params: { uri: "spaceship://domains/example.com" } });
    await vi.advanceTimersByTimeAsync(0);
    expect((client.getDomain as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("example.com");
    cleanup();
  });

  it("subscribe handler starts polling for DNS records", async () => {
    const { cleanup, client } = setupWithHandlers();
    await subscribeHandler({ params: { uri: "spaceship://domains/example.com/dns" } });
    await vi.advanceTimersByTimeAsync(0);
    expect((client.listAllDnsRecords as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("example.com");
    cleanup();
  });

  it("unsubscribe handler stops polling", async () => {
    const { cleanup } = setupWithHandlers();
    await subscribeHandler({ params: { uri: "spaceship://domains" } });
    await vi.advanceTimersByTimeAsync(0);
    await unsubscribeHandler({ params: { uri: "spaceship://domains" } });
    cleanup();
  });

  it("unsubscribe on non-subscribed uri is a no-op", async () => {
    const { cleanup } = setupWithHandlers();
    await unsubscribeHandler({ params: { uri: "spaceship://unknown" } });
    cleanup();
  });

  it("subscribe handler ignores unknown URIs", async () => {
    const { cleanup, client } = setupWithHandlers();
    await subscribeHandler({ params: { uri: "spaceship://unknown" } });
    await vi.advanceTimersByTimeAsync(0);
    expect((client.listAllDomains as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    cleanup();
  });

  it("does not double-subscribe to the same URI", async () => {
    const { cleanup, client } = setupWithHandlers();
    await subscribeHandler({ params: { uri: "spaceship://domains" } });
    await vi.advanceTimersByTimeAsync(0);
    await subscribeHandler({ params: { uri: "spaceship://domains" } });
    await vi.advanceTimersByTimeAsync(0);
    // Only one initial fetch, not two
    expect((client.listAllDomains as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("poll detects data changes and sends notification", async () => {
    const mockClient = makeMockClient();
    const listFn = mockClient.listAllDomains as ReturnType<typeof vi.fn>;
    listFn.mockResolvedValueOnce([{ name: "a.com" }]);
    listFn.mockResolvedValueOnce([{ name: "a.com" }, { name: "b.com" }]);

    const mcpServer = new McpServer({ name: "test", version: "1.0.0" });
    vi.spyOn(mcpServer.server, "sendResourceUpdated").mockResolvedValue(undefined as never);

    const origHandler = mcpServer.server.setRequestHandler.bind(mcpServer.server);
    vi.spyOn(mcpServer.server, "setRequestHandler").mockImplementation((schema: unknown, handler: unknown) => {
      if (schema === SubscribeRequestSchema) subscribeHandler = handler as RequestHandler;
      else if (schema === UnsubscribeRequestSchema) unsubscribeHandler = handler as RequestHandler;
      return origHandler(schema as never, handler as never);
    });

    const cleanup = registerResourceSubscriptions(mcpServer, mockClient);
    await subscribeHandler({ params: { uri: "spaceship://domains" } });
    // Flush initial fetch
    await vi.advanceTimersByTimeAsync(0);
    expect(listFn).toHaveBeenCalledTimes(1);
    // Advance past poll interval to trigger poll
    await vi.advanceTimersByTimeAsync(30_000);
    expect(listFn).toHaveBeenCalledTimes(2);
    expect(mcpServer.server.sendResourceUpdated).toHaveBeenCalledWith({ uri: "spaceship://domains" });
    cleanup();
  });

  it("poll does not notify when data is unchanged", async () => {
    const mockClient = makeMockClient();
    const listFn = mockClient.listAllDomains as ReturnType<typeof vi.fn>;
    // Return same data both times
    listFn.mockResolvedValue([{ name: "a.com" }]);

    const mcpServer = new McpServer({ name: "test", version: "1.0.0" });
    vi.spyOn(mcpServer.server, "sendResourceUpdated").mockResolvedValue(undefined as never);

    const origHandler = mcpServer.server.setRequestHandler.bind(mcpServer.server);
    vi.spyOn(mcpServer.server, "setRequestHandler").mockImplementation((schema: unknown, handler: unknown) => {
      if (schema === SubscribeRequestSchema) subscribeHandler = handler as RequestHandler;
      else if (schema === UnsubscribeRequestSchema) unsubscribeHandler = handler as RequestHandler;
      return origHandler(schema as never, handler as never);
    });

    const cleanup = registerResourceSubscriptions(mcpServer, mockClient);
    await subscribeHandler({ params: { uri: "spaceship://domains" } });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mcpServer.server.sendResourceUpdated).not.toHaveBeenCalled();
    cleanup();
  });

  it("poll handles fetch errors gracefully", async () => {
    const mockClient = makeMockClient();
    const listFn = mockClient.listAllDomains as ReturnType<typeof vi.fn>;
    listFn.mockResolvedValueOnce([{ name: "a.com" }]);
    listFn.mockRejectedValueOnce(new Error("network error"));

    const mcpServer = new McpServer({ name: "test", version: "1.0.0" });
    const origHandler = mcpServer.server.setRequestHandler.bind(mcpServer.server);
    vi.spyOn(mcpServer.server, "setRequestHandler").mockImplementation((schema: unknown, handler: unknown) => {
      if (schema === SubscribeRequestSchema) subscribeHandler = handler as RequestHandler;
      else if (schema === UnsubscribeRequestSchema) unsubscribeHandler = handler as RequestHandler;
      return origHandler(schema as never, handler as never);
    });

    const cleanup = registerResourceSubscriptions(mcpServer, mockClient);
    await subscribeHandler({ params: { uri: "spaceship://domains" } });
    await vi.advanceTimersByTimeAsync(0);
    // Should not throw when poll fails
    await vi.advanceTimersByTimeAsync(30_000);
    cleanup();
  });

  it("handles initial fetch failure and still sets up polling", async () => {
    const mockClient = makeMockClient();
    const listFn = mockClient.listAllDomains as ReturnType<typeof vi.fn>;
    listFn.mockRejectedValueOnce(new Error("fail"));
    listFn.mockResolvedValueOnce([{ name: "a.com" }]);

    const mcpServer = new McpServer({ name: "test", version: "1.0.0" });
    vi.spyOn(mcpServer.server, "sendResourceUpdated").mockResolvedValue(undefined as never);

    const origHandler = mcpServer.server.setRequestHandler.bind(mcpServer.server);
    vi.spyOn(mcpServer.server, "setRequestHandler").mockImplementation((schema: unknown, handler: unknown) => {
      if (schema === SubscribeRequestSchema) subscribeHandler = handler as RequestHandler;
      else if (schema === UnsubscribeRequestSchema) unsubscribeHandler = handler as RequestHandler;
      return origHandler(schema as never, handler as never);
    });

    const cleanup = registerResourceSubscriptions(mcpServer, mockClient);
    await subscribeHandler({ params: { uri: "spaceship://domains" } });
    // Flush initial fetch (which fails)
    await vi.advanceTimersByTimeAsync(0);
    // Polling should still be set up — advance to trigger it
    await vi.advanceTimersByTimeAsync(30_000);
    expect(listFn).toHaveBeenCalledTimes(2);
    // Data changed from "" (initial failure) to actual data
    expect(mcpServer.server.sendResourceUpdated).toHaveBeenCalledWith({ uri: "spaceship://domains" });
    cleanup();
  });

  it("cleanup clears all subscriptions", async () => {
    const { cleanup } = setupWithHandlers();
    await subscribeHandler({ params: { uri: "spaceship://domains" } });
    await vi.advanceTimersByTimeAsync(0);
    cleanup();
    // Cleanup should not throw even when called multiple times
    cleanup();
  });

  it("integrates into createServer without errors", () => {
    const client = makeMockClient();
    const server = createServer(client);
    expect(server).toBeDefined();
  });
});
