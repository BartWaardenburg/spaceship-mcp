import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpaceshipClient } from "./spaceship-client.js";
import { registerCompletablePrompts } from "./completions.js";

const mockClient = {
  listAllDomains: vi.fn().mockResolvedValue([
    { name: "example.com" },
    { name: "example.org" },
    { name: "mysite.net" },
  ]),
} as unknown as SpaceshipClient;

type RegisteredPrompt = {
  argsSchema?: Record<string, unknown>;
};
type ServerWithPrompts = { _registeredPrompts: Record<string, RegisteredPrompt> };

describe("registerCompletablePrompts", () => {
  it("registers all 4 prompts", () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerCompletablePrompts(server, mockClient);

    const prompts = Object.keys((server as unknown as ServerWithPrompts)._registeredPrompts);
    expect(prompts).toHaveLength(4);
    expect(prompts).toEqual(
      expect.arrayContaining(["domain-lookup", "dns-records", "set-privacy", "update-nameservers"]),
    );
  });

  it("all prompts have argsSchema", () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerCompletablePrompts(server, mockClient);

    const prompts = (server as unknown as ServerWithPrompts)._registeredPrompts;
    for (const [name, prompt] of Object.entries(prompts)) {
      expect(prompt.argsSchema, `Prompt "${name}" should have argsSchema`).toBeDefined();
    }
  });
});
