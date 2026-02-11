import { describe, it, expect, vi } from "vitest";
import { createServer } from "./server.js";
import type { SpaceshipClient } from "./spaceship-client.js";
import type { DnsRecord } from "./types.js";

type ReadCallback = (uri: URL, variables?: Record<string, string>) => Promise<{
  contents: Array<{ uri: string; mimeType: string; text: string }>;
}>;

type RegisteredResource = { readCallback: ReadCallback; enabled: boolean };
type RegisteredTemplate = {
  resourceTemplate: { uriTemplate: { match: (uri: string) => Record<string, string> | null } };
  readCallback: ReadCallback;
};

type ServerWithResources = {
  _registeredResources: Record<string, RegisteredResource>;
  _registeredResourceTemplates: Record<string, RegisteredTemplate>;
};

const mockDomains = [{ name: "example.com", expirationDate: "2027-01-01" }];
const mockDomainDetails = {
  name: "example.com",
  expirationDate: "2027-01-01",
  contacts: { registrant: "contact-1" },
};
const mockDnsRecords: DnsRecord[] = [
  { name: "@", type: "A", address: "1.2.3.4", ttl: 3600 },
];
const mockSellerHubDomains = [{ name: "forsale.com", status: "active" }];

const mockClient = {
  listAllDomains: vi.fn().mockResolvedValue(mockDomains),
  getDomain: vi.fn().mockResolvedValue(mockDomainDetails),
  listAllDnsRecords: vi.fn().mockResolvedValue(mockDnsRecords),
  listAllSellerHubDomains: vi.fn().mockResolvedValue(mockSellerHubDomains),
} as unknown as SpaceshipClient;

const getResources = (): ServerWithResources =>
  createServer(mockClient) as unknown as ServerWithResources;

describe("registerResources", () => {
  it("registers static and template resources", () => {
    const server = getResources();
    expect(server._registeredResources["spaceship://domains"]).toBeDefined();
    expect(server._registeredResources["spaceship://sellerhub"]).toBeDefined();
    expect(server._registeredResourceTemplates["domain-details"]).toBeDefined();
    expect(server._registeredResourceTemplates["domain-dns"]).toBeDefined();
    expect(server._registeredResourceTemplates["domain-contacts"]).toBeDefined();
  });

  it("domains resource returns all domains", async () => {
    const server = getResources();
    const resource = server._registeredResources["spaceship://domains"];
    const result = await resource.readCallback(new URL("spaceship://domains"));

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].uri).toBe("spaceship://domains");
    expect(result.contents[0].mimeType).toBe("application/json");
    expect(JSON.parse(result.contents[0].text)).toEqual(mockDomains);
  });

  it("domain-details template returns domain info", async () => {
    const server = getResources();
    const template = server._registeredResourceTemplates["domain-details"];
    const uri = new URL("spaceship://domains/example.com");
    const result = await template.readCallback(uri, { domain: "example.com" });

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].uri).toBe("spaceship://domains/example.com");
    expect(JSON.parse(result.contents[0].text)).toEqual(mockDomainDetails);
  });

  it("domain-dns template returns DNS records", async () => {
    const server = getResources();
    const template = server._registeredResourceTemplates["domain-dns"];
    const uri = new URL("spaceship://domains/example.com/dns");
    const result = await template.readCallback(uri, { domain: "example.com" });

    expect(result.contents).toHaveLength(1);
    const records = JSON.parse(result.contents[0].text);
    expect(records).toHaveLength(1);
    expect(records[0].type).toBe("A");
  });

  it("domain-contacts template returns contacts", async () => {
    const server = getResources();
    const template = server._registeredResourceTemplates["domain-contacts"];
    const uri = new URL("spaceship://domains/example.com/contacts");
    const result = await template.readCallback(uri, { domain: "example.com" });

    expect(result.contents).toHaveLength(1);
    expect(JSON.parse(result.contents[0].text)).toEqual({ registrant: "contact-1" });
  });

  it("domain-contacts returns empty object when no contacts", async () => {
    const clientNoContacts = {
      ...mockClient,
      getDomain: vi.fn().mockResolvedValue({ name: "bare.com" }),
    } as unknown as SpaceshipClient;
    const server = createServer(clientNoContacts) as unknown as ServerWithResources;
    const template = server._registeredResourceTemplates["domain-contacts"];
    const uri = new URL("spaceship://domains/bare.com/contacts");
    const result = await template.readCallback(uri, { domain: "bare.com" });

    expect(JSON.parse(result.contents[0].text)).toEqual({});
  });

  it("sellerhub resource returns all listings", async () => {
    const server = getResources();
    const resource = server._registeredResources["spaceship://sellerhub"];
    const result = await resource.readCallback(new URL("spaceship://sellerhub"));

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].uri).toBe("spaceship://sellerhub");
    expect(JSON.parse(result.contents[0].text)).toEqual(mockSellerHubDomains);
  });
});
