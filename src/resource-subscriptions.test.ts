import { describe, it, expect, vi, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpaceshipClient } from "./spaceship-client.js";
import { registerResourceSubscriptions } from "./resource-subscriptions.js";

const makeMockClient = (): SpaceshipClient =>
  ({
    listAllDomains: vi.fn().mockResolvedValue([{ name: "example.com" }]),
    listAllDnsRecords: vi.fn().mockResolvedValue([{ type: "A", name: "@", address: "1.2.3.4" }]),
    getDomain: vi.fn().mockResolvedValue({ name: "example.com", status: "active" }),
  }) as unknown as SpaceshipClient;

type ServerWithResources = {
  _registeredResources: Record<string, unknown>;
  _registeredResourceTemplates: Record<string, unknown>;
};

describe("registerResourceSubscriptions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers domain resources", () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    const client = makeMockClient();
    registerResourceSubscriptions(server, client);

    const internal = server as unknown as ServerWithResources;
    expect(Object.keys(internal._registeredResources)).toContain("spaceship://domains");
  });

  it("registers resource templates", () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    const client = makeMockClient();
    registerResourceSubscriptions(server, client);

    const internal = server as unknown as ServerWithResources;
    expect(Object.keys(internal._registeredResourceTemplates)).toHaveLength(2);
  });

  it("returns a cleanup function", () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    const client = makeMockClient();
    const cleanup = registerResourceSubscriptions(server, client);

    expect(typeof cleanup).toBe("function");
    cleanup(); // Should not throw
  });
});
