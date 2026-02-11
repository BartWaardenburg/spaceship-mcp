import * as z from "zod/v4";
import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpaceshipClient } from "./spaceship-client.js";
import { registerDynamicTools } from "./dynamic-tools.js";

type RegisteredTool = {
  description: string;
  handler: (args: Record<string, unknown>, extra: unknown) => Promise<unknown>;
};

type ServerWithTools = { _registeredTools: Record<string, RegisteredTool> };

const mockClient = {
  listAllDnsRecords: vi.fn().mockResolvedValue([]),
  listDnsRecords: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  saveDnsRecords: vi.fn().mockResolvedValue(undefined),
  deleteDnsRecords: vi.fn().mockResolvedValue(undefined),
  listAllDomains: vi.fn().mockResolvedValue([{ name: "example.com" }]),
  listDomains: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  getDomain: vi.fn().mockResolvedValue({ name: "example.com" }),
  checkDomainAvailability: vi.fn().mockResolvedValue({ available: true }),
  checkDomainsAvailability: vi.fn().mockResolvedValue([]),
  updateNameservers: vi.fn().mockResolvedValue(undefined),
  setAutoRenew: vi.fn().mockResolvedValue(undefined),
  setTransferLock: vi.fn().mockResolvedValue(undefined),
  getAuthCode: vi.fn().mockResolvedValue({ authCode: "test" }),
  registerDomain: vi.fn().mockResolvedValue({ operationId: "op-1" }),
  renewDomain: vi.fn().mockResolvedValue({ operationId: "op-1" }),
  restoreDomain: vi.fn().mockResolvedValue({ operationId: "op-1" }),
  transferDomain: vi.fn().mockResolvedValue({ operationId: "op-1" }),
  getTransferStatus: vi.fn().mockResolvedValue({ status: "pending" }),
  getAsyncOperation: vi.fn().mockResolvedValue({ status: "success" }),
  saveContact: vi.fn().mockResolvedValue({ contactId: "c-1" }),
  getContact: vi.fn().mockResolvedValue({ firstName: "John" }),
  saveContactAttributes: vi.fn().mockResolvedValue({ contactId: "c-1" }),
  getContactAttributes: vi.fn().mockResolvedValue({}),
  updateDomainContacts: vi.fn().mockResolvedValue({ verificationStatus: null }),
  setPrivacyLevel: vi.fn().mockResolvedValue(undefined),
  setEmailProtection: vi.fn().mockResolvedValue(undefined),
  listAllSellerHubDomains: vi.fn().mockResolvedValue([]),
  listSellerHubDomains: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  createSellerHubDomain: vi.fn().mockResolvedValue({}),
  getSellerHubDomain: vi.fn().mockResolvedValue({}),
  updateSellerHubDomain: vi.fn().mockResolvedValue({}),
  deleteSellerHubDomain: vi.fn().mockResolvedValue(undefined),
  createCheckoutLink: vi.fn().mockResolvedValue({}),
  getVerificationRecords: vi.fn().mockResolvedValue({ options: [] }),
  listPersonalNameservers: vi.fn().mockResolvedValue([]),
  getPersonalNameserver: vi.fn().mockResolvedValue({}),
  updatePersonalNameserver: vi.fn().mockResolvedValue(undefined),
  deletePersonalNameserver: vi.fn().mockResolvedValue(undefined),
} as unknown as SpaceshipClient;

const getTools = (): Record<string, RegisteredTool> => {
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerDynamicTools(server, mockClient);
  return (server as unknown as ServerWithTools)._registeredTools;
};

describe("registerDynamicTools", () => {
  it("registers exactly 3 meta-tools", () => {
    const tools = getTools();
    expect(Object.keys(tools)).toHaveLength(3);
    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining(["search_tools", "describe_tools", "execute_tool"]),
    );
  });

  it("search_tools finds tools by name", async () => {
    const tools = getTools();
    const result = await tools.search_tools.handler({ query: "dns" }, {}) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("list_dns_records");
  });

  it("search_tools returns no matches message", async () => {
    const tools = getTools();
    const result = await tools.search_tools.handler({ query: "nonexistent_xyz" }, {}) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("No tools found");
  });

  it("describe_tools returns schema for known tool", async () => {
    const tools = getTools();
    const result = await tools.describe_tools.handler({ tools: ["list_domains"] }, {}) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("list_domains");
    expect(result.content[0].text).toContain("Parameters");
  });

  it("describe_tools handles unknown tool", async () => {
    const tools = getTools();
    const result = await tools.describe_tools.handler({ tools: ["unknown"] }, {}) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("not found");
  });

  it("execute_tool runs a tool", async () => {
    const tools = getTools();
    const result = await tools.execute_tool.handler(
      { tool: "list_domains", arguments: { fetchAll: true } },
      {},
    ) as { content: Array<{ text: string }> };
    expect(result.content[0].text).toContain("Total domains");
  });

  it("execute_tool returns error for unknown tool", async () => {
    const tools = getTools();
    const result = await tools.execute_tool.handler(
      { tool: "unknown", arguments: {} },
      {},
    ) as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("execute_tool catches handler errors", async () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    // Register a tool that throws before registerDynamicTools collects it
    server.registerTool(
      "_test_throw",
      { description: "throws on execute", inputSchema: z.object({}) },
      async () => { throw new Error("kaboom"); },
    );
    registerDynamicTools(server, mockClient);
    const tools = (server as unknown as ServerWithTools)._registeredTools;
    const result = await tools.execute_tool.handler(
      { tool: "_test_throw", arguments: {} },
      {},
    ) as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error executing");
    expect(result.content[0].text).toContain("kaboom");
  });

  it("execute_tool catches non-Error throws", async () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    server.registerTool(
      "_test_throw_string",
      { description: "throws string", inputSchema: z.object({}) },
      async () => { throw "string error"; },
    );
    registerDynamicTools(server, mockClient);
    const tools = (server as unknown as ServerWithTools)._registeredTools;
    const result = await tools.execute_tool.handler(
      { tool: "_test_throw_string", arguments: {} },
      {},
    ) as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("string error");
  });

  it("search_tools matches by tool title", async () => {
    const tools = getTools();
    const result = await tools.search_tools.handler({ query: "List Domains" }, {}) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("list_domains");
  });
});
