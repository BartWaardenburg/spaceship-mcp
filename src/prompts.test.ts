import { describe, it, expect } from "vitest";
import { createServer } from "./server.js";
import type { SpaceshipClient } from "./spaceship-client.js";

type PromptCallback = (args: Record<string, string>) => {
  messages: Array<{ role: string; content: { type: string; text: string } }>;
};

type RegisteredPrompt = { callback: PromptCallback; enabled: boolean };
type ServerWithPrompts = { _registeredPrompts: Record<string, RegisteredPrompt> };

const mockClient = {} as SpaceshipClient;

const getPrompts = (): Record<string, RegisteredPrompt> =>
  (createServer(mockClient) as unknown as ServerWithPrompts)._registeredPrompts;

describe("registerPrompts", () => {
  it("registers all 5 prompts", () => {
    const prompts = getPrompts();
    expect(Object.keys(prompts)).toHaveLength(5);
    expect(prompts["setup-domain"]).toBeDefined();
    expect(prompts["audit-domain"]).toBeDefined();
    expect(prompts["setup-email"]).toBeDefined();
    expect(prompts["migrate-dns"]).toBeDefined();
    expect(prompts["list-for-sale"]).toBeDefined();
  });

  it("setup-domain returns message with domain name", () => {
    const result = getPrompts()["setup-domain"].callback({ domain: "test.com" });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content.text).toContain("test.com");
    expect(result.messages[0].content.text).toContain("check_domain_availability");
  });

  it("audit-domain returns message with domain name", () => {
    const result = getPrompts()["audit-domain"].callback({ domain: "audit.com" });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain("audit.com");
    expect(result.messages[0].content.text).toContain("get_domain");
  });

  it("setup-email returns google-specific instructions", () => {
    const result = getPrompts()["setup-email"].callback({ domain: "mail.com", provider: "google" });
    expect(result.messages[0].content.text).toContain("Google Workspace");
    expect(result.messages[0].content.text).toContain("aspmx.l.google.com");
  });

  it("setup-email returns microsoft-specific instructions", () => {
    const result = getPrompts()["setup-email"].callback({ domain: "mail.com", provider: "microsoft" });
    expect(result.messages[0].content.text).toContain("Microsoft 365");
  });

  it("setup-email returns fastmail-specific instructions", () => {
    const result = getPrompts()["setup-email"].callback({ domain: "mail.com", provider: "fastmail" });
    expect(result.messages[0].content.text).toContain("Fastmail");
    expect(result.messages[0].content.text).toContain("messagingengine.com");
  });

  it("setup-email returns custom provider instructions", () => {
    const result = getPrompts()["setup-email"].callback({ domain: "mail.com", provider: "custom" });
    expect(result.messages[0].content.text).toContain("custom provider");
  });

  it("migrate-dns returns message with domain name", () => {
    const result = getPrompts()["migrate-dns"].callback({ domain: "migrate.com" });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain("migrate.com");
    expect(result.messages[0].content.text).toContain("list_dns_records");
  });

  it("list-for-sale returns message with domain name", () => {
    const result = getPrompts()["list-for-sale"].callback({ domain: "sell.com" });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain("sell.com");
    expect(result.messages[0].content.text).toContain("create_sellerhub_domain");
  });
});
