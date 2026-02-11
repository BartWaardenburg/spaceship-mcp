import { describe, it, expect, vi } from "vitest";
import { createServer } from "./server.js";
import { domainCompleter, staticCompleter } from "./prompts.js";
import type { SpaceshipClient } from "./spaceship-client.js";

type PromptCallback = (args: Record<string, string>) => Promise<{
  messages: Array<{ role: string; content: { type: string; text: string } }>;
}>;

type RegisteredPrompt = { callback: PromptCallback; enabled: boolean };
type ServerWithPrompts = { _registeredPrompts: Record<string, RegisteredPrompt> };

const mockClient = {} as SpaceshipClient;

const getPrompts = (): Record<string, RegisteredPrompt> =>
  (createServer(mockClient) as unknown as ServerWithPrompts)._registeredPrompts;

describe("domainCompleter", () => {
  it("filters domains by prefix", async () => {
    const client = {
      listAllDomains: vi.fn().mockResolvedValue([
        { name: "example.com" },
        { name: "example.org" },
        { name: "other.net" },
      ]),
    } as unknown as SpaceshipClient;

    const complete = domainCompleter(client);
    const results = await complete("exam");
    expect(results).toEqual(["example.com", "example.org"]);
  });

  it("matches case-insensitively", async () => {
    const client = {
      listAllDomains: vi.fn().mockResolvedValue([
        { name: "Example.COM" },
      ]),
    } as unknown as SpaceshipClient;

    const complete = domainCompleter(client);
    expect(await complete("example")).toEqual(["Example.COM"]);
  });

  it("returns empty array on API error", async () => {
    const client = {
      listAllDomains: vi.fn().mockRejectedValue(new Error("API down")),
    } as unknown as SpaceshipClient;

    const complete = domainCompleter(client);
    expect(await complete("test")).toEqual([]);
  });
});

describe("staticCompleter", () => {
  it("filters options by prefix", () => {
    const complete = staticCompleter(["google", "microsoft", "fastmail"]);
    expect(complete("g")).toEqual(["google"]);
    expect(complete("m")).toEqual(["microsoft"]);
  });

  it("matches case-insensitively", () => {
    const complete = staticCompleter(["Google", "Microsoft"]);
    expect(complete("goo")).toEqual(["Google"]);
  });

  it("returns all options for empty string", () => {
    const complete = staticCompleter(["a", "b"]);
    expect(complete("")).toEqual(["a", "b"]);
  });

  it("returns all options for undefined value", () => {
    const complete = staticCompleter(["a", "b"]);
    expect(complete(undefined)).toEqual(["a", "b"]);
  });
});

describe("registerPrompts", () => {
  it("registers all 8 prompts", () => {
    const prompts = getPrompts();
    expect(Object.keys(prompts)).toHaveLength(8);
    expect(prompts["setup-domain"]).toBeDefined();
    expect(prompts["audit-domain"]).toBeDefined();
    expect(prompts["setup-email"]).toBeDefined();
    expect(prompts["migrate-dns"]).toBeDefined();
    expect(prompts["list-for-sale"]).toBeDefined();
    expect(prompts["dns-records"]).toBeDefined();
    expect(prompts["set-privacy"]).toBeDefined();
    expect(prompts["update-nameservers"]).toBeDefined();
  });

  it("setup-domain returns message with domain name", async () => {
    const result = await getPrompts()["setup-domain"].callback({ domain: "test.com" });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content.text).toContain("test.com");
    expect(result.messages[0].content.text).toContain("check_domain_availability");
  });

  it("audit-domain returns message with domain name", async () => {
    const result = await getPrompts()["audit-domain"].callback({ domain: "audit.com" });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain("audit.com");
    expect(result.messages[0].content.text).toContain("get_domain");
  });

  it("setup-email returns google-specific instructions", async () => {
    const result = await getPrompts()["setup-email"].callback({ domain: "mail.com", provider: "google" });
    expect(result.messages[0].content.text).toContain("Google Workspace");
    expect(result.messages[0].content.text).toContain("aspmx.l.google.com");
  });

  it("setup-email returns microsoft-specific instructions", async () => {
    const result = await getPrompts()["setup-email"].callback({ domain: "mail.com", provider: "microsoft" });
    expect(result.messages[0].content.text).toContain("Microsoft 365");
  });

  it("setup-email returns fastmail-specific instructions", async () => {
    const result = await getPrompts()["setup-email"].callback({ domain: "mail.com", provider: "fastmail" });
    expect(result.messages[0].content.text).toContain("Fastmail");
    expect(result.messages[0].content.text).toContain("messagingengine.com");
  });

  it("setup-email returns custom provider instructions", async () => {
    const result = await getPrompts()["setup-email"].callback({ domain: "mail.com", provider: "custom" });
    expect(result.messages[0].content.text).toContain("custom provider");
  });

  it("migrate-dns returns message with domain name", async () => {
    const result = await getPrompts()["migrate-dns"].callback({ domain: "migrate.com" });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain("migrate.com");
    expect(result.messages[0].content.text).toContain("list_dns_records");
  });

  it("list-for-sale returns message with domain name", async () => {
    const result = await getPrompts()["list-for-sale"].callback({ domain: "sell.com" });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain("sell.com");
    expect(result.messages[0].content.text).toContain("create_sellerhub_domain");
  });

  it("dns-records returns message with domain name", async () => {
    const result = await getPrompts()["dns-records"].callback({ domain: "test.com" });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain("test.com");
    expect(result.messages[0].content.text).toContain("list_dns_records");
  });

  it("dns-records with type filter includes type in message", async () => {
    const result = await getPrompts()["dns-records"].callback({ domain: "test.com", type: "MX" });
    expect(result.messages[0].content.text).toContain("MX");
  });

  it("set-privacy returns message with domain and level", async () => {
    const result = await getPrompts()["set-privacy"].callback({ domain: "test.com", level: "high" });
    expect(result.messages[0].content.text).toContain("test.com");
    expect(result.messages[0].content.text).toContain("high");
  });

  it("update-nameservers returns message for basic provider", async () => {
    const result = await getPrompts()["update-nameservers"].callback({ domain: "test.com", provider: "basic" });
    expect(result.messages[0].content.text).toContain("default Spaceship nameservers");
  });

  it("update-nameservers returns message for custom provider", async () => {
    const result = await getPrompts()["update-nameservers"].callback({ domain: "test.com", provider: "custom" });
    expect(result.messages[0].content.text).toContain("custom nameservers");
  });
});
