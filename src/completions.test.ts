import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpaceshipClient } from "./spaceship-client.js";
import { registerCompletablePrompts, domainCompleter, staticCompleter } from "./completions.js";

const mockClient = {
  listAllDomains: vi.fn().mockResolvedValue([
    { name: "example.com" },
    { name: "example.org" },
    { name: "mysite.net" },
  ]),
} as unknown as SpaceshipClient;

type PromptCallback = (args: Record<string, string>) => Promise<{
  messages: Array<{ role: string; content: { type: string; text: string } }>;
}>;

type RegisteredPrompt = {
  argsSchema?: Record<string, unknown>;
  callback: PromptCallback;
};
type ServerWithPrompts = { _registeredPrompts: Record<string, RegisteredPrompt> };

const getPrompts = (client = mockClient): Record<string, RegisteredPrompt> => {
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerCompletablePrompts(server, client);
  return (server as unknown as ServerWithPrompts)._registeredPrompts;
};

describe("registerCompletablePrompts", () => {
  it("registers all 4 prompts", () => {
    const prompts = Object.keys(getPrompts());
    expect(prompts).toHaveLength(4);
    expect(prompts).toEqual(
      expect.arrayContaining(["domain-lookup", "dns-records", "set-privacy", "update-nameservers"]),
    );
  });

  it("all prompts have argsSchema", () => {
    for (const [name, prompt] of Object.entries(getPrompts())) {
      expect(prompt.argsSchema, `Prompt "${name}" should have argsSchema`).toBeDefined();
    }
  });

  it("domain-lookup returns message with domain", async () => {
    const result = await getPrompts()["domain-lookup"].callback({ domain: "example.com" });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain("example.com");
    expect(result.messages[0].content.text).toContain("get_domain");
  });

  it("dns-records returns message with type filter", async () => {
    const result = await getPrompts()["dns-records"].callback({ domain: "example.com", type: "MX" });
    expect(result.messages[0].content.text).toContain("MX");
    expect(result.messages[0].content.text).toContain("example.com");
  });

  it("dns-records returns message without type filter", async () => {
    const result = await getPrompts()["dns-records"].callback({ domain: "example.com", type: "" });
    expect(result.messages[0].content.text).toContain("organize them by type");
  });

  it("set-privacy returns message with level", async () => {
    const result = await getPrompts()["set-privacy"].callback({ domain: "example.com", level: "high" });
    expect(result.messages[0].content.text).toContain("high");
    expect(result.messages[0].content.text).toContain("set_privacy_level");
  });

  it("update-nameservers returns basic provider message", async () => {
    const result = await getPrompts()["update-nameservers"].callback({ domain: "example.com", provider: "basic" });
    expect(result.messages[0].content.text).toContain("default Spaceship nameservers");
  });

  it("update-nameservers returns custom provider message", async () => {
    const result = await getPrompts()["update-nameservers"].callback({ domain: "example.com", provider: "custom" });
    expect(result.messages[0].content.text).toContain("custom nameservers");
  });
});

describe("domainCompleter", () => {
  it("filters domains by prefix", async () => {
    const complete = domainCompleter(mockClient);
    const results = await complete("example");
    expect(results).toEqual(["example.com", "example.org"]);
  });

  it("returns all domains for empty prefix", async () => {
    const complete = domainCompleter(mockClient);
    const results = await complete("");
    expect(results).toEqual(["example.com", "example.org", "mysite.net"]);
  });

  it("returns empty array on API error", async () => {
    const failClient = {
      listAllDomains: vi.fn().mockRejectedValue(new Error("API error")),
    } as unknown as SpaceshipClient;
    const complete = domainCompleter(failClient);
    const results = await complete("test");
    expect(results).toEqual([]);
  });
});

describe("staticCompleter", () => {
  it("filters options by prefix", () => {
    const complete = staticCompleter(["high", "public"]);
    expect(complete("h")).toEqual(["high"]);
    expect(complete("p")).toEqual(["public"]);
  });

  it("returns all options for empty string", () => {
    const complete = staticCompleter(["A", "AAAA", "CNAME"]);
    expect(complete("")).toEqual(["A", "AAAA", "CNAME"]);
  });

  it("handles undefined value", () => {
    const complete = staticCompleter(["basic", "custom"]);
    expect(complete(undefined)).toEqual(["basic", "custom"]);
  });
});
