import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SpaceshipClient } from "../spaceship-client.js";
import { SpaceshipApiError } from "../spaceship-client.js";
import { registerAnalysisTools } from "./analysis.js";
import { registerDnsRecordTools } from "./dns-records.js";
import { registerDnsRecordCreatorTools } from "./dns-record-creators.js";
import { registerDomainManagementTools } from "./domain-management.js";
import { registerDomainLifecycleTools } from "./domain-lifecycle.js";
import { registerContactsPrivacyTools } from "./contacts-privacy.js";
import { registerPersonalNameserverTools } from "./personal-nameservers.js";
import { registerSellerHubTools } from "./sellerhub.js";

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

interface ToolResult {
  content: { type: string; text: string }[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}

const createMockServer = () => {
  const handlers = new Map<string, ToolHandler>();
  return {
    registerTool: vi.fn((name: string, _config: unknown, handler: ToolHandler) => {
      handlers.set(name, handler);
    }),
    getHandler: (name: string): ToolHandler => {
      const handler = handlers.get(name);
      if (!handler) throw new Error(`No handler registered for "${name}"`);
      return handler;
    },
  };
};

const apiError = new SpaceshipApiError("API failed", 500, { code: "INTERNAL" });

const createMockClient = (): Record<string, ReturnType<typeof vi.fn>> => ({
  listAllDnsRecords: vi.fn(),
  listDnsRecords: vi.fn(),
  saveDnsRecords: vi.fn(),
  deleteDnsRecords: vi.fn(),
  listAllDomains: vi.fn(),
  listDomains: vi.fn(),
  getDomain: vi.fn(),
  checkDomainAvailability: vi.fn(),
  checkDomainsAvailability: vi.fn(),
  updateNameservers: vi.fn(),
  setAutoRenew: vi.fn(),
  setTransferLock: vi.fn(),
  getAuthCode: vi.fn(),
  registerDomain: vi.fn(),
  renewDomain: vi.fn(),
  restoreDomain: vi.fn(),
  transferDomain: vi.fn(),
  getTransferStatus: vi.fn(),
  getAsyncOperation: vi.fn(),
  saveContact: vi.fn(),
  getContact: vi.fn(),
  saveContactAttributes: vi.fn(),
  getContactAttributes: vi.fn(),
  updateDomainContacts: vi.fn(),
  setPrivacyLevel: vi.fn(),
  setEmailProtection: vi.fn(),
  listPersonalNameservers: vi.fn(),
  getPersonalNameserver: vi.fn(),
  updatePersonalNameserver: vi.fn(),
  deletePersonalNameserver: vi.fn(),
  listAllSellerHubDomains: vi.fn(),
  listSellerHubDomains: vi.fn(),
  createSellerHubDomain: vi.fn(),
  getSellerHubDomain: vi.fn(),
  updateSellerHubDomain: vi.fn(),
  deleteSellerHubDomain: vi.fn(),
  createCheckoutLink: vi.fn(),
  getVerificationRecords: vi.fn(),
});

const getText = (result: ToolResult): string => result.content[0].text;

describe("Analysis Tools", () => {
  let server: ReturnType<typeof createMockServer>;
  let client: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    server = createMockServer();
    client = createMockClient();
    registerAnalysisTools(server as never, client as unknown as SpaceshipClient);
  });

  describe("check_dns_alignment", () => {
    it("reports all records matching", async () => {
      client.listAllDnsRecords.mockResolvedValue([
        { type: "A", name: "@", address: "1.2.3.4", ttl: 3600 },
      ]);

      const result = (await server.getHandler("check_dns_alignment")({
        domain: "example.com",
        expectedRecords: [{ type: "A", name: "@", address: "1.2.3.4" }],
        includeTtlInMatch: false,
        includeUnexpectedOfTypes: ["A", "AAAA", "CNAME", "MX", "TXT", "SRV"],
      })) as ToolResult;

      expect(result.isError).toBeUndefined();
      expect(getText(result)).toContain("Missing: 0");
      expect(getText(result)).toContain("Unexpected");
      expect(getText(result)).toContain("0");
    });

    it("reports missing records", async () => {
      client.listAllDnsRecords.mockResolvedValue([]);

      const result = (await server.getHandler("check_dns_alignment")({
        domain: "example.com",
        expectedRecords: [{ type: "A", name: "@", address: "1.2.3.4" }],
        includeTtlInMatch: false,
        includeUnexpectedOfTypes: ["A"],
      })) as ToolResult;

      expect(getText(result)).toContain("Missing: 1");
      expect(result.structuredContent?.missing).toHaveLength(1);
    });

    it("reports unexpected records", async () => {
      client.listAllDnsRecords.mockResolvedValue([
        { type: "A", name: "@", address: "1.2.3.4", ttl: 3600 },
        { type: "A", name: "www", address: "5.6.7.8", ttl: 3600 },
      ]);

      const result = (await server.getHandler("check_dns_alignment")({
        domain: "example.com",
        expectedRecords: [{ type: "A", name: "@", address: "1.2.3.4" }],
        includeTtlInMatch: false,
        includeUnexpectedOfTypes: ["A"],
      })) as ToolResult;

      expect(getText(result)).toContain("Unexpected");
      expect(result.structuredContent?.unexpected).toHaveLength(1);
    });

    it("matches with TTL when includeTtlInMatch=true", async () => {
      client.listAllDnsRecords.mockResolvedValue([
        { type: "A", name: "@", address: "1.2.3.4", ttl: 7200 },
      ]);

      const result = (await server.getHandler("check_dns_alignment")({
        domain: "example.com",
        expectedRecords: [{ type: "A", name: "@", address: "1.2.3.4", ttl: 3600 }],
        includeTtlInMatch: true,
        includeUnexpectedOfTypes: ["A"],
      })) as ToolResult;

      // TTL mismatch means the expected record is "missing" and actual is "unexpected"
      expect(getText(result)).toContain("Missing: 1");
    });

    it("returns error on client failure", async () => {
      client.listAllDnsRecords.mockRejectedValue(apiError);

      const result = (await server.getHandler("check_dns_alignment")({
        domain: "example.com",
        expectedRecords: [{ type: "A", name: "@", address: "1.2.3.4" }],
        includeTtlInMatch: false,
        includeUnexpectedOfTypes: ["A"],
      })) as ToolResult;

      expect(result.isError).toBe(true);
      expect(getText(result)).toContain("500");
    });
  });
});

describe("DNS Record Tools", () => {
  let server: ReturnType<typeof createMockServer>;
  let client: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    server = createMockServer();
    client = createMockClient();
    registerDnsRecordTools(server as never, client as unknown as SpaceshipClient);
  });

  describe("list_dns_records", () => {
    it("fetches all records when fetchAll=true", async () => {
      client.listAllDnsRecords.mockResolvedValue([
        { type: "A", name: "@", address: "1.2.3.4", ttl: 3600 },
        { type: "MX", name: "@", exchange: "mail.example.com", preference: 10, ttl: 3600 },
      ]);

      const result = (await server.getHandler("list_dns_records")({
        domain: "EXAMPLE.COM",
        fetchAll: true,
        take: 500,
        skip: 0,
      })) as ToolResult;

      expect(client.listAllDnsRecords).toHaveBeenCalledWith("example.com", undefined);
      expect(getText(result)).toContain("Records returned: 2");
      expect(getText(result)).toContain("example.com");
    });

    it("fetches paginated records when fetchAll=false with orderBy", async () => {
      client.listDnsRecords.mockResolvedValue({
        items: [{ type: "A", name: "@", address: "1.2.3.4", ttl: 3600 }],
        total: 5,
      });

      const result = (await server.getHandler("list_dns_records")({
        domain: "example.com",
        fetchAll: false,
        take: 1,
        skip: 0,
        orderBy: "type",
      })) as ToolResult;

      expect(client.listDnsRecords).toHaveBeenCalledWith("example.com", {
        take: 1,
        skip: 0,
        orderBy: "type",
      });
      expect(getText(result)).toContain("Records returned: 1");
    });

    it("fetches paginated records when fetchAll=false without orderBy", async () => {
      client.listDnsRecords.mockResolvedValue({
        items: [{ type: "A", name: "@", address: "1.2.3.4", ttl: 3600 }],
        total: 1,
      });

      const result = (await server.getHandler("list_dns_records")({
        domain: "example.com",
        fetchAll: false,
        take: 10,
        skip: 0,
      })) as ToolResult;

      expect(client.listDnsRecords).toHaveBeenCalledWith("example.com", {
        take: 10,
        skip: 0,
      });
      expect(getText(result)).toContain("Records returned: 1");
    });

    it("returns error on failure", async () => {
      client.listAllDnsRecords.mockRejectedValue(apiError);

      const result = (await server.getHandler("list_dns_records")({
        domain: "example.com",
        fetchAll: true,
        take: 500,
        skip: 0,
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("save_dns_records", () => {
    it("saves records successfully", async () => {
      client.saveDnsRecords.mockResolvedValue(undefined);

      const result = (await server.getHandler("save_dns_records")({
        domain: "example.com",
        records: [
          { name: "@", type: "A", ttl: 3600, address: "1.2.3.4" },
          { name: "www", type: "CNAME", ttl: 3600, cname: "example.com" },
        ],
      })) as ToolResult;

      expect(getText(result)).toContain("Successfully created 2 DNS record(s)");
      expect(client.saveDnsRecords).toHaveBeenCalledWith("example.com", expect.arrayContaining([
        expect.objectContaining({ name: "@", type: "A", address: "1.2.3.4" }),
      ]));
    });

    it("passes all optional fields when defined", async () => {
      client.saveDnsRecords.mockResolvedValue(undefined);

      const result = (await server.getHandler("save_dns_records")({
        domain: "example.com",
        records: [{
          name: "_sip._tcp", type: "SRV", ttl: 3600,
          service: "_sip", protocol: "_tcp", priority: 10, weight: 20, port: 5060, target: "sip.example.com",
          value: "test", aliasName: "a", flag: 0, tag: "issue", cname: "c",
          svcPriority: 1, targetName: "t", svcParams: "alpn=h2",
          exchange: "mx", preference: 10, nameserver: "ns1", pointer: "ptr",
          scheme: "_https", usage: 3, selector: 1, matching: 1, associationData: "abc123",
        }],
      })) as ToolResult;

      expect(getText(result)).toContain("Successfully created 1 DNS record(s)");
      const savedRecord = client.saveDnsRecords.mock.calls[0][1][0];
      expect(savedRecord.service).toBe("_sip");
      expect(savedRecord.associationData).toBe("abc123");
    });

    it("returns error on failure", async () => {
      client.saveDnsRecords.mockRejectedValue(apiError);

      const result = (await server.getHandler("save_dns_records")({
        domain: "example.com",
        records: [{ name: "@", type: "A", ttl: 3600, address: "1.2.3.4" }],
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("delete_dns_records", () => {
    it("deletes records successfully", async () => {
      client.deleteDnsRecords.mockResolvedValue(undefined);

      const result = (await server.getHandler("delete_dns_records")({
        domain: "example.com",
        records: [{ name: "@", type: "A" }],
      })) as ToolResult;

      expect(getText(result)).toContain("Successfully deleted 1 DNS record(s)");
      expect(client.deleteDnsRecords).toHaveBeenCalledWith("example.com", [{ name: "@", type: "A" }]);
    });

    it("returns error on failure", async () => {
      client.deleteDnsRecords.mockRejectedValue(apiError);

      const result = (await server.getHandler("delete_dns_records")({
        domain: "example.com",
        records: [{ name: "@", type: "A" }],
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });
});

describe("DNS Record Creator Tools", () => {
  let server: ReturnType<typeof createMockServer>;
  let client: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    server = createMockServer();
    client = createMockClient();
    registerDnsRecordCreatorTools(server as never, client as unknown as SpaceshipClient);
  });

  const expectSuccess = (result: ToolResult, substring: string): void => {
    expect(result.isError).toBeUndefined();
    expect(getText(result)).toContain(substring);
  };

  const expectSaveCalled = (name: string, type: string): void => {
    expect(client.saveDnsRecords).toHaveBeenCalledWith(
      "example.com",
      [expect.objectContaining({ name, type })],
    );
  };

  describe("create_a_record", () => {
    it("creates A record successfully", async () => {
      client.saveDnsRecords.mockResolvedValue(undefined);
      const result = (await server.getHandler("create_a_record")({
        domain: "example.com", name: "@", address: "1.2.3.4", ttl: 3600,
      })) as ToolResult;

      expectSuccess(result, "Successfully created A record");
      expectSaveCalled("@", "A");
    });

    it("returns error on failure", async () => {
      client.saveDnsRecords.mockRejectedValue(apiError);
      const result = (await server.getHandler("create_a_record")({
        domain: "example.com", name: "@", address: "1.2.3.4", ttl: 3600,
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("create_aaaa_record", () => {
    it("creates AAAA record successfully", async () => {
      client.saveDnsRecords.mockResolvedValue(undefined);
      const result = (await server.getHandler("create_aaaa_record")({
        domain: "example.com", name: "@", address: "2001:db8::1", ttl: 3600,
      })) as ToolResult;

      expectSuccess(result, "Successfully created AAAA record");
      expectSaveCalled("@", "AAAA");
    });

    it("returns error on failure", async () => {
      client.saveDnsRecords.mockRejectedValue(apiError);
      const result = (await server.getHandler("create_aaaa_record")({
        domain: "example.com", name: "@", address: "2001:db8::1", ttl: 3600,
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("create_cname_record", () => {
    it("creates CNAME record successfully", async () => {
      client.saveDnsRecords.mockResolvedValue(undefined);
      const result = (await server.getHandler("create_cname_record")({
        domain: "example.com", name: "www", cname: "example.com", ttl: 3600,
      })) as ToolResult;

      expectSuccess(result, "Successfully created CNAME record");
      expectSaveCalled("www", "CNAME");
    });

    it("returns error on failure", async () => {
      client.saveDnsRecords.mockRejectedValue(apiError);
      const result = (await server.getHandler("create_cname_record")({
        domain: "example.com", name: "www", cname: "example.com", ttl: 3600,
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("create_mx_record", () => {
    it("creates MX record successfully", async () => {
      client.saveDnsRecords.mockResolvedValue(undefined);
      const result = (await server.getHandler("create_mx_record")({
        domain: "example.com", name: "@", priority: 10, exchange: "mail.example.com", ttl: 3600,
      })) as ToolResult;

      expectSuccess(result, "Successfully created MX record");
      expect(getText(result)).toContain("priority: 10");
      expect(client.saveDnsRecords).toHaveBeenCalledWith(
        "example.com",
        [expect.objectContaining({ type: "MX", preference: 10, exchange: "mail.example.com" })],
      );
    });

    it("returns error on failure", async () => {
      client.saveDnsRecords.mockRejectedValue(apiError);
      const result = (await server.getHandler("create_mx_record")({
        domain: "example.com", name: "@", priority: 10, exchange: "mail.example.com", ttl: 3600,
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("create_srv_record", () => {
    it("creates SRV record successfully", async () => {
      client.saveDnsRecords.mockResolvedValue(undefined);
      const result = (await server.getHandler("create_srv_record")({
        domain: "example.com", name: "_sip._tcp", priority: 10, weight: 20, port: 5060, target: "sip.example.com", ttl: 3600,
      })) as ToolResult;

      expectSuccess(result, "Successfully created SRV record");
      expect(getText(result)).toContain("sip.example.com:5060");
    });

    it("returns error on failure", async () => {
      client.saveDnsRecords.mockRejectedValue(apiError);
      const result = (await server.getHandler("create_srv_record")({
        domain: "example.com", name: "_sip._tcp", priority: 10, weight: 20, port: 5060, target: "sip.example.com", ttl: 3600,
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("create_txt_record", () => {
    it("creates TXT record successfully", async () => {
      client.saveDnsRecords.mockResolvedValue(undefined);
      const result = (await server.getHandler("create_txt_record")({
        domain: "example.com", name: "@", value: "v=spf1 include:example.com -all", ttl: 3600,
      })) as ToolResult;

      expectSuccess(result, "Successfully created TXT record");
      expectSaveCalled("@", "TXT");
    });

    it("returns error on failure", async () => {
      client.saveDnsRecords.mockRejectedValue(apiError);
      const result = (await server.getHandler("create_txt_record")({
        domain: "example.com", name: "@", value: "v=spf1", ttl: 3600,
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("create_alias_record", () => {
    it("creates ALIAS record successfully", async () => {
      client.saveDnsRecords.mockResolvedValue(undefined);
      const result = (await server.getHandler("create_alias_record")({
        domain: "example.com", name: "@", aliasName: "cdn.example.com", ttl: 3600,
      })) as ToolResult;

      expectSuccess(result, "Successfully created ALIAS record");
      expect(getText(result)).toContain("cdn.example.com");
    });

    it("returns error on failure", async () => {
      client.saveDnsRecords.mockRejectedValue(apiError);
      const result = (await server.getHandler("create_alias_record")({
        domain: "example.com", name: "@", aliasName: "cdn.example.com", ttl: 3600,
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("create_caa_record", () => {
    it("creates CAA record successfully", async () => {
      client.saveDnsRecords.mockResolvedValue(undefined);
      const result = (await server.getHandler("create_caa_record")({
        domain: "example.com", name: "@", flag: 0, tag: "issue", value: "letsencrypt.org", ttl: 3600,
      })) as ToolResult;

      expectSuccess(result, "Successfully created CAA record");
      expect(getText(result)).toContain('0 issue "letsencrypt.org"');
    });

    it("returns error on failure", async () => {
      client.saveDnsRecords.mockRejectedValue(apiError);
      const result = (await server.getHandler("create_caa_record")({
        domain: "example.com", name: "@", flag: 0, tag: "issue", value: "letsencrypt.org", ttl: 3600,
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("create_https_record", () => {
    it("creates HTTPS record successfully", async () => {
      client.saveDnsRecords.mockResolvedValue(undefined);
      const result = (await server.getHandler("create_https_record")({
        domain: "example.com", name: "@", svcPriority: 1, targetName: "cdn.example.com",
        svcParams: "alpn=h2,h3", port: "_443", scheme: "_https", ttl: 3600,
      })) as ToolResult;

      expectSuccess(result, "Successfully created HTTPS record");
      expect(getText(result)).toContain("1 cdn.example.com");
    });

    it("returns error on failure", async () => {
      client.saveDnsRecords.mockRejectedValue(apiError);
      const result = (await server.getHandler("create_https_record")({
        domain: "example.com", name: "@", svcPriority: 1, targetName: ".", ttl: 3600,
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("create_ns_record", () => {
    it("creates NS record successfully", async () => {
      client.saveDnsRecords.mockResolvedValue(undefined);
      const result = (await server.getHandler("create_ns_record")({
        domain: "example.com", name: "sub", nameserver: "ns1.example.com", ttl: 3600,
      })) as ToolResult;

      expectSuccess(result, "Successfully created NS record");
      expect(getText(result)).toContain("ns1.example.com");
    });

    it("returns error on failure", async () => {
      client.saveDnsRecords.mockRejectedValue(apiError);
      const result = (await server.getHandler("create_ns_record")({
        domain: "example.com", name: "sub", nameserver: "ns1.example.com", ttl: 3600,
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("create_ptr_record", () => {
    it("creates PTR record successfully", async () => {
      client.saveDnsRecords.mockResolvedValue(undefined);
      const result = (await server.getHandler("create_ptr_record")({
        domain: "example.com", name: "1", pointer: "host.example.com", ttl: 3600,
      })) as ToolResult;

      expectSuccess(result, "Successfully created PTR record");
      expect(getText(result)).toContain("host.example.com");
    });

    it("returns error on failure", async () => {
      client.saveDnsRecords.mockRejectedValue(apiError);
      const result = (await server.getHandler("create_ptr_record")({
        domain: "example.com", name: "1", pointer: "host.example.com", ttl: 3600,
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("create_svcb_record", () => {
    it("creates SVCB record successfully", async () => {
      client.saveDnsRecords.mockResolvedValue(undefined);
      const result = (await server.getHandler("create_svcb_record")({
        domain: "example.com", name: "_dns", svcPriority: 1, targetName: "dns.example.com",
        svcParams: "alpn=dot", port: "_853", scheme: "_tcp", ttl: 3600,
      })) as ToolResult;

      expectSuccess(result, "Successfully created SVCB record");
      expect(getText(result)).toContain("1 dns.example.com");
    });

    it("returns error on failure", async () => {
      client.saveDnsRecords.mockRejectedValue(apiError);
      const result = (await server.getHandler("create_svcb_record")({
        domain: "example.com", name: "_dns", svcPriority: 1, targetName: "dns.example.com", ttl: 3600,
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("create_tlsa_record", () => {
    it("creates TLSA record successfully", async () => {
      client.saveDnsRecords.mockResolvedValue(undefined);
      const result = (await server.getHandler("create_tlsa_record")({
        domain: "example.com", name: "_443._tcp", port: "_443", protocol: "_tcp",
        usage: 3, selector: 1, matching: 1, associationData: "abc123def456",
        scheme: "_tcp", ttl: 3600,
      })) as ToolResult;

      expectSuccess(result, "Successfully created TLSA record");
      expect(getText(result)).toContain("3 1 1");
    });

    it("returns error on failure", async () => {
      client.saveDnsRecords.mockRejectedValue(apiError);
      const result = (await server.getHandler("create_tlsa_record")({
        domain: "example.com", name: "_443._tcp", port: "_443", protocol: "_tcp",
        usage: 3, selector: 1, matching: 1, associationData: "abc123", ttl: 3600,
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });
});

describe("Domain Management Tools", () => {
  let server: ReturnType<typeof createMockServer>;
  let client: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    server = createMockServer();
    client = createMockClient();
    registerDomainManagementTools(server as never, client as unknown as SpaceshipClient);
  });

  describe("list_domains", () => {
    it("fetches all domains when fetchAll=true", async () => {
      client.listAllDomains.mockResolvedValue([
        { name: "example.com", expirationDate: "2025-12-31" },
        { name: "test.org" },
      ]);

      const result = (await server.getHandler("list_domains")({
        fetchAll: true, take: 100, skip: 0,
      })) as ToolResult;

      expect(getText(result)).toContain("Total domains: 2");
      expect(getText(result)).toContain("example.com");
      expect(getText(result)).toContain("expires: 2025-12-31");
      expect(getText(result)).toContain("test.org");
    });

    it("fetches paginated domains when fetchAll=false", async () => {
      client.listDomains.mockResolvedValue({
        items: [{ name: "example.com" }],
        total: 5,
      });

      const result = (await server.getHandler("list_domains")({
        fetchAll: false, take: 1, skip: 0,
      })) as ToolResult;

      expect(getText(result)).toContain("Total: 5");
      expect(getText(result)).toContain("showing 1");
    });

    it("returns error on failure", async () => {
      client.listAllDomains.mockRejectedValue(apiError);

      const result = (await server.getHandler("list_domains")({
        fetchAll: true, take: 100, skip: 0,
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("get_domain", () => {
    it("returns full domain details with all optional fields", async () => {
      client.getDomain.mockResolvedValue({
        name: "example.com",
        registrationDate: "2020-01-01",
        expirationDate: "2025-12-31",
        autoRenew: true,
        lifecycleStatus: "active",
        verificationStatus: "verified",
        privacyProtection: { level: "high" },
        nameservers: { hosts: ["ns1.spaceship.com", "ns2.spaceship.com"] },
      });

      const result = (await server.getHandler("get_domain")({
        domain: "example.com",
      })) as ToolResult;

      const text = getText(result);
      expect(text).toContain("Domain: example.com");
      expect(text).toContain("Registered: 2020-01-01");
      expect(text).toContain("Expires: 2025-12-31");
      expect(text).toContain("Auto-renew: true");
      expect(text).toContain("Lifecycle: active");
      expect(text).toContain("Verification: verified");
      expect(text).toContain("Privacy: high");
      expect(text).toContain("ns1.spaceship.com, ns2.spaceship.com");
    });

    it("returns domain details with minimal fields", async () => {
      client.getDomain.mockResolvedValue({ name: "example.com" });

      const result = (await server.getHandler("get_domain")({
        domain: "example.com",
      })) as ToolResult;

      const text = getText(result);
      expect(text).toContain("Domain: example.com");
      expect(text).not.toContain("Registered:");
      expect(text).not.toContain("Privacy:");
    });

    it("returns error on failure", async () => {
      client.getDomain.mockRejectedValue(apiError);

      const result = (await server.getHandler("get_domain")({
        domain: "example.com",
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("check_domain_availability", () => {
    it("checks single domain availability (available)", async () => {
      client.checkDomainAvailability.mockResolvedValue({
        domain: "new-domain.com",
        available: true,
      });

      const result = (await server.getHandler("check_domain_availability")({
        domains: ["new-domain.com"],
      })) as ToolResult;

      expect(getText(result)).toContain("AVAILABLE");
      expect(client.checkDomainAvailability).toHaveBeenCalledWith("new-domain.com");
    });

    it("checks single domain with premium pricing", async () => {
      client.checkDomainAvailability.mockResolvedValue({
        domain: "premium.com",
        available: true,
        premiumPricing: [{ registerPrice: 999, currency: "USD" }],
      });

      const result = (await server.getHandler("check_domain_availability")({
        domains: ["premium.com"],
      })) as ToolResult;

      expect(getText(result)).toContain("AVAILABLE");
      expect(getText(result)).toContain("USD 999");
    });

    it("checks single domain with pricing missing currency", async () => {
      client.checkDomainAvailability.mockResolvedValue({
        domain: "premium.com",
        available: true,
        premiumPricing: [{ registerPrice: 500 }],
      });

      const result = (await server.getHandler("check_domain_availability")({
        domains: ["premium.com"],
      })) as ToolResult;

      expect(getText(result)).toContain("USD 500");
    });

    it("checks multiple domains availability", async () => {
      client.checkDomainsAvailability.mockResolvedValue([
        { domain: "a.com", available: true },
        { domain: "b.com", available: false },
      ]);

      const result = (await server.getHandler("check_domain_availability")({
        domains: ["a.com", "b.com"],
      })) as ToolResult;

      expect(getText(result)).toContain("a.com: AVAILABLE");
      expect(getText(result)).toContain("b.com: NOT AVAILABLE");
      expect(client.checkDomainsAvailability).toHaveBeenCalled();
    });

    it("returns error on failure", async () => {
      client.checkDomainAvailability.mockRejectedValue(apiError);

      const result = (await server.getHandler("check_domain_availability")({
        domains: ["example.com"],
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("update_nameservers", () => {
    it("switches to basic (Spaceship) DNS", async () => {
      client.updateNameservers.mockResolvedValue(undefined);

      const result = (await server.getHandler("update_nameservers")({
        domain: "example.com", provider: "basic", nameservers: [],
      })) as ToolResult;

      expect(getText(result)).toContain("switched example.com to Spaceship built-in DNS");
    });

    it("updates to custom nameservers", async () => {
      client.updateNameservers.mockResolvedValue(undefined);

      const result = (await server.getHandler("update_nameservers")({
        domain: "example.com", provider: "custom", nameservers: ["ns1.custom.com", "ns2.custom.com"],
      })) as ToolResult;

      expect(getText(result)).toContain("ns1.custom.com, ns2.custom.com");
    });

    it("returns error on failure", async () => {
      client.updateNameservers.mockRejectedValue(apiError);

      const result = (await server.getHandler("update_nameservers")({
        domain: "example.com", provider: "custom", nameservers: ["ns1.custom.com"],
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("set_auto_renew", () => {
    it("enables auto-renewal", async () => {
      client.setAutoRenew.mockResolvedValue(undefined);

      const result = (await server.getHandler("set_auto_renew")({
        domain: "example.com", enabled: true,
      })) as ToolResult;

      expect(getText(result)).toContain("Auto-renewal enabled");
    });

    it("disables auto-renewal", async () => {
      client.setAutoRenew.mockResolvedValue(undefined);

      const result = (await server.getHandler("set_auto_renew")({
        domain: "example.com", enabled: false,
      })) as ToolResult;

      expect(getText(result)).toContain("Auto-renewal disabled");
    });

    it("returns error on failure", async () => {
      client.setAutoRenew.mockRejectedValue(apiError);

      const result = (await server.getHandler("set_auto_renew")({
        domain: "example.com", enabled: true,
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("set_transfer_lock", () => {
    it("enables transfer lock", async () => {
      client.setTransferLock.mockResolvedValue(undefined);

      const result = (await server.getHandler("set_transfer_lock")({
        domain: "example.com", locked: true,
      })) as ToolResult;

      expect(getText(result)).toContain("Transfer lock enabled");
    });

    it("disables transfer lock", async () => {
      client.setTransferLock.mockResolvedValue(undefined);

      const result = (await server.getHandler("set_transfer_lock")({
        domain: "example.com", locked: false,
      })) as ToolResult;

      expect(getText(result)).toContain("Transfer lock disabled");
    });

    it("returns error on failure", async () => {
      client.setTransferLock.mockRejectedValue(apiError);

      const result = (await server.getHandler("set_transfer_lock")({
        domain: "example.com", locked: true,
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("get_auth_code", () => {
    it("returns auth code with expires", async () => {
      client.getAuthCode.mockResolvedValue({ authCode: "ABC123XYZ", expires: "2025-12-31" });

      const result = (await server.getHandler("get_auth_code")({
        domain: "example.com",
      })) as ToolResult;

      expect(getText(result)).toContain("Auth code for example.com: ABC123XYZ");
      expect(getText(result)).toContain("Expires: 2025-12-31");
    });

    it("returns auth code without expires", async () => {
      client.getAuthCode.mockResolvedValue({ authCode: "ABC123XYZ" });

      const result = (await server.getHandler("get_auth_code")({
        domain: "example.com",
      })) as ToolResult;

      expect(getText(result)).toContain("Auth code for example.com: ABC123XYZ");
      expect(getText(result)).not.toContain("Expires:");
    });

    it("returns error on failure", async () => {
      client.getAuthCode.mockRejectedValue(apiError);

      const result = (await server.getHandler("get_auth_code")({
        domain: "example.com",
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });
});

describe("Domain Lifecycle Tools", () => {
  let server: ReturnType<typeof createMockServer>;
  let client: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    server = createMockServer();
    client = createMockClient();
    registerDomainLifecycleTools(server as never, client as unknown as SpaceshipClient);
  });

  describe("register_domain", () => {
    it("initiates domain registration", async () => {
      client.registerDomain.mockResolvedValue({ operationId: "op-123" });

      const result = (await server.getHandler("register_domain")({
        domain: "new-domain.com", years: 2, autoRenew: true, privacyLevel: "high",
      })) as ToolResult;

      expect(getText(result)).toContain("Domain registration initiated");
      expect(getText(result)).toContain("op-123");
      expect(getText(result)).toContain("Years: 2");
      expect(client.registerDomain).toHaveBeenCalledWith("new-domain.com", {
        years: 2,
        autoRenew: true,
        privacyProtection: { level: "high", userConsent: true },
      });
    });

    it("passes contacts when provided", async () => {
      client.registerDomain.mockResolvedValue({ operationId: "op-456" });
      const contacts = {
        registrant: {
          firstName: "John", lastName: "Doe", email: "john@example.com",
          address1: "123 Main", city: "NY", country: "US", postalCode: "10001", phone: "+1.5551234567",
        },
      };

      await server.getHandler("register_domain")({
        domain: "new-domain.com", years: 1, autoRenew: true, privacyLevel: "high", contacts,
      });

      expect(client.registerDomain).toHaveBeenCalledWith("new-domain.com", expect.objectContaining({
        contacts,
      }));
    });

    it("returns error on failure", async () => {
      client.registerDomain.mockRejectedValue(apiError);

      const result = (await server.getHandler("register_domain")({
        domain: "new-domain.com", years: 1, autoRenew: true, privacyLevel: "high",
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("renew_domain", () => {
    it("initiates domain renewal", async () => {
      client.renewDomain.mockResolvedValue({ operationId: "op-renew-1" });

      const result = (await server.getHandler("renew_domain")({
        domain: "example.com", years: 1, currentExpirationDate: "2025-12-31",
      })) as ToolResult;

      expect(getText(result)).toContain("Domain renewal initiated");
      expect(getText(result)).toContain("op-renew-1");
      expect(getText(result)).toContain("Current expiration: 2025-12-31");
    });

    it("returns error on failure", async () => {
      client.renewDomain.mockRejectedValue(apiError);

      const result = (await server.getHandler("renew_domain")({
        domain: "example.com", years: 1, currentExpirationDate: "2025-12-31",
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("restore_domain", () => {
    it("initiates domain restore", async () => {
      client.restoreDomain.mockResolvedValue({ operationId: "op-restore-1" });

      const result = (await server.getHandler("restore_domain")({
        domain: "example.com",
      })) as ToolResult;

      expect(getText(result)).toContain("Domain restore initiated");
      expect(getText(result)).toContain("op-restore-1");
    });

    it("returns error on failure", async () => {
      client.restoreDomain.mockRejectedValue(apiError);

      const result = (await server.getHandler("restore_domain")({
        domain: "example.com",
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("transfer_domain", () => {
    it("initiates domain transfer with auth code", async () => {
      client.transferDomain.mockResolvedValue({ operationId: "op-transfer-1" });

      const result = (await server.getHandler("transfer_domain")({
        domain: "example.com", authCode: "AUTH123", autoRenew: true, privacyLevel: "high",
      })) as ToolResult;

      expect(getText(result)).toContain("Domain transfer initiated");
      expect(getText(result)).toContain("op-transfer-1");
      expect(client.transferDomain).toHaveBeenCalledWith("example.com", expect.objectContaining({
        authCode: "AUTH123",
        privacyProtection: { level: "high", userConsent: true },
      }));
    });

    it("initiates transfer without auth code (e.g. .uk)", async () => {
      client.transferDomain.mockResolvedValue({ operationId: "op-transfer-2" });

      await server.getHandler("transfer_domain")({
        domain: "example.co.uk", autoRenew: false, privacyLevel: "public",
      });

      expect(client.transferDomain).toHaveBeenCalledWith("example.co.uk", {
        autoRenew: false,
        privacyProtection: { level: "public", userConsent: true },
      });
    });

    it("passes contacts when provided", async () => {
      client.transferDomain.mockResolvedValue({ operationId: "op-transfer-3" });
      const contacts = {
        registrant: {
          firstName: "Jane", lastName: "Doe", email: "jane@example.com",
          address1: "456 Oak", city: "LA", country: "US", postalCode: "90001", phone: "+1.5559876543",
        },
      };

      await server.getHandler("transfer_domain")({
        domain: "example.com", autoRenew: true, privacyLevel: "high", contacts,
      });

      expect(client.transferDomain).toHaveBeenCalledWith("example.com", expect.objectContaining({
        contacts,
      }));
    });

    it("returns error on failure", async () => {
      client.transferDomain.mockRejectedValue(apiError);

      const result = (await server.getHandler("transfer_domain")({
        domain: "example.com", autoRenew: true, privacyLevel: "high",
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("get_transfer_status", () => {
    it("returns transfer status with extra fields", async () => {
      client.getTransferStatus.mockResolvedValue({
        status: "pending",
        step: "awaiting_approval",
        createdAt: "2025-01-01",
      });

      const result = (await server.getHandler("get_transfer_status")({
        domain: "example.com",
      })) as ToolResult;

      expect(getText(result)).toContain("Transfer status for example.com: pending");
      expect(getText(result)).toContain("step: awaiting_approval");
      expect(getText(result)).toContain("createdAt: 2025-01-01");
    });

    it("handles object values in status response", async () => {
      client.getTransferStatus.mockResolvedValue({
        status: "processing",
        details: { reason: "in_progress" },
      });

      const result = (await server.getHandler("get_transfer_status")({
        domain: "example.com",
      })) as ToolResult;

      expect(getText(result)).toContain("processing");
      expect(getText(result)).toContain("details:");
    });

    it("returns error on failure", async () => {
      client.getTransferStatus.mockRejectedValue(apiError);

      const result = (await server.getHandler("get_transfer_status")({
        domain: "example.com",
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("get_async_operation", () => {
    it("returns operation with all optional fields", async () => {
      client.getAsyncOperation.mockResolvedValue({
        status: "success",
        type: "domain_registration",
        createdAt: "2025-01-01T00:00:00Z",
        modifiedAt: "2025-01-01T00:01:00Z",
        details: { domain: "example.com" },
      });

      const result = (await server.getHandler("get_async_operation")({
        operationId: "op-123",
      })) as ToolResult;

      const text = getText(result);
      expect(text).toContain("Operation op-123: success");
      expect(text).toContain("Type: domain_registration");
      expect(text).toContain("Created: 2025-01-01T00:00:00Z");
      expect(text).toContain("Modified: 2025-01-01T00:01:00Z");
      expect(text).toContain("Details:");
    });

    it("returns operation with minimal fields", async () => {
      client.getAsyncOperation.mockResolvedValue({ status: "pending" });

      const result = (await server.getHandler("get_async_operation")({
        operationId: "op-456",
      })) as ToolResult;

      const text = getText(result);
      expect(text).toContain("Operation op-456: pending");
      expect(text).not.toContain("Type:");
      expect(text).not.toContain("Created:");
    });

    it("returns error on failure", async () => {
      client.getAsyncOperation.mockRejectedValue(apiError);

      const result = (await server.getHandler("get_async_operation")({
        operationId: "op-999",
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });
});

describe("Contacts & Privacy Tools", () => {
  let server: ReturnType<typeof createMockServer>;
  let client: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    server = createMockServer();
    client = createMockClient();
    registerContactsPrivacyTools(server as never, client as unknown as SpaceshipClient);
  });

  describe("save_contact", () => {
    it("saves contact with organization", async () => {
      client.saveContact.mockResolvedValue({ contactId: "c-123" });

      const result = (await server.getHandler("save_contact")({
        firstName: "John", lastName: "Doe", organization: "ACME Corp",
        email: "john@acme.com", address1: "123 Main", city: "NY",
        country: "US", postalCode: "10001", phone: "+1.5551234567",
      })) as ToolResult;

      const text = getText(result);
      expect(text).toContain("Contact saved successfully");
      expect(text).toContain("Contact ID: c-123");
      expect(text).toContain("Name: John Doe");
      expect(text).toContain("Organization: ACME Corp");
      expect(text).toContain("Email: john@acme.com");
    });

    it("saves contact without organization", async () => {
      client.saveContact.mockResolvedValue({ contactId: "c-456" });

      const result = (await server.getHandler("save_contact")({
        firstName: "Jane", lastName: "Smith", email: "jane@example.com",
        address1: "456 Oak", city: "LA", country: "US", postalCode: "90001", phone: "+1.5559876543",
      })) as ToolResult;

      const text = getText(result);
      expect(text).not.toContain("Organization:");
    });

    it("handles missing contactId", async () => {
      client.saveContact.mockResolvedValue({
        contactId: undefined,
      });

      const result = (await server.getHandler("save_contact")({
        firstName: "Test", lastName: "User", email: "test@example.com",
        address1: "789 Elm", city: "SF", country: "US", postalCode: "94102", phone: "+1.5550001111",
      })) as ToolResult;

      expect(getText(result)).toContain("Contact ID: undefined");
    });

    it("returns error on failure", async () => {
      client.saveContact.mockRejectedValue(apiError);

      const result = (await server.getHandler("save_contact")({
        firstName: "Test", lastName: "User", email: "test@example.com",
        address1: "789 Elm", city: "SF", country: "US", postalCode: "94102", phone: "+1.5550001111",
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("get_contact", () => {
    it("returns full contact details with all optional fields", async () => {
      client.getContact.mockResolvedValue({
        contactId: "c-123",
        firstName: "John",
        lastName: "Doe",
        organization: "ACME",
        email: "john@acme.com",
        address1: "123 Main St",
        address2: "Suite 100",
        city: "New York",
        stateProvince: "NY",
        postalCode: "10001",
        country: "US",
        phone: "+1.5551234567",
        phoneExt: "42",
      });

      const result = (await server.getHandler("get_contact")({
        contactId: "c-123",
      })) as ToolResult;

      const text = getText(result);
      expect(text).toContain("Contact: John Doe");
      expect(text).toContain("Organization: ACME");
      expect(text).toContain("Address: 123 Main St, Suite 100");
      expect(text).toContain("NY 10001");
      expect(text).toContain("ext. 42");
    });

    it("returns contact without optional fields", async () => {
      client.getContact.mockResolvedValue({
        contactId: "c-789",
        firstName: "Jane",
        lastName: "Smith",
        email: "jane@example.com",
        address1: "456 Oak Ave",
        city: "Chicago",
        postalCode: "60601",
        country: "US",
        phone: "+1.5559876543",
      });

      const result = (await server.getHandler("get_contact")({
        contactId: "c-789",
      })) as ToolResult;

      const text = getText(result);
      expect(text).not.toContain("Organization:");
      expect(text).not.toContain("Suite");
      expect(text).not.toContain("ext.");
    });

    it("shows N/A when contactId is missing", async () => {
      client.getContact.mockResolvedValue({
        firstName: "Jane",
        lastName: "Smith",
        email: "jane@example.com",
        address1: "456 Oak Ave",
        city: "Chicago",
        postalCode: "60601",
        country: "US",
        phone: "+1.5559876543",
      });

      const result = (await server.getHandler("get_contact")({
        contactId: "c-789",
      })) as ToolResult;

      expect(getText(result)).toContain("ID: N/A");
    });

    it("handles missing stateProvince and postalCode", async () => {
      client.getContact.mockResolvedValue({
        contactId: "c-456",
        firstName: "Max",
        lastName: "Müller",
        email: "max@example.de",
        address1: "Hauptstr. 1",
        city: "Berlin",
        country: "DE",
        phone: "+49.301234567",
      });

      const result = (await server.getHandler("get_contact")({
        contactId: "c-456",
      })) as ToolResult;

      const text = getText(result);
      expect(text).toContain("City: Berlin,");
      expect(text).toContain("Country: DE");
    });

    it("returns error on failure", async () => {
      client.getContact.mockRejectedValue(apiError);

      const result = (await server.getHandler("get_contact")({
        contactId: "c-999",
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("save_contact_attributes", () => {
    it("saves attributes successfully", async () => {
      client.saveContactAttributes.mockResolvedValue({ contactId: "c-attr-1" });

      const result = (await server.getHandler("save_contact_attributes")({
        attributes: { type: "us", appPurpose: "P1", nexusCategory: "C11" },
      })) as ToolResult;

      expect(getText(result)).toContain("Successfully saved 3 contact attribute(s)");
      expect(getText(result)).toContain("contactId: c-attr-1");
      expect(getText(result)).toContain("type: us");
    });

    it("returns error on failure", async () => {
      client.saveContactAttributes.mockRejectedValue(apiError);

      const result = (await server.getHandler("save_contact_attributes")({
        attributes: { type: "us" },
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("get_contact_attributes", () => {
    it("returns attributes when present", async () => {
      client.getContactAttributes.mockResolvedValue({
        type: "us",
        appPurpose: "P1",
      });

      const result = (await server.getHandler("get_contact_attributes")({
        contactId: "c-123",
      })) as ToolResult;

      expect(getText(result)).toContain("Contact attributes (2):");
      expect(getText(result)).toContain("type: us");
      expect(getText(result)).toContain("appPurpose: P1");
    });

    it("returns message when no attributes found", async () => {
      client.getContactAttributes.mockResolvedValue({});

      const result = (await server.getHandler("get_contact_attributes")({
        contactId: "c-empty",
      })) as ToolResult;

      expect(getText(result)).toBe("No contact attributes found.");
    });

    it("returns error on failure", async () => {
      client.getContactAttributes.mockRejectedValue(apiError);

      const result = (await server.getHandler("get_contact_attributes")({
        contactId: "c-999",
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("update_domain_contacts", () => {
    it("updates multiple contact roles", async () => {
      client.updateDomainContacts.mockResolvedValue({ verificationStatus: "success" });

      const result = (await server.getHandler("update_domain_contacts")({
        domain: "example.com",
        registrant: "contact-reg-123",
        admin: "contact-admin-456",
      })) as ToolResult;

      expect(getText(result)).toContain("Successfully updated contacts");
      expect(getText(result)).toContain("registrant, admin");
      expect(getText(result)).toContain("Verification status: success");
    });

    it("includes attribute count when present", async () => {
      client.updateDomainContacts.mockResolvedValue({ verificationStatus: null });

      const result = (await server.getHandler("update_domain_contacts")({
        domain: "example.com",
        tech: "contact-tech-123",
        attributes: ["attr-id-1"],
      })) as ToolResult;

      expect(getText(result)).toContain("tech");
      expect(getText(result)).toContain("with 1 attribute ID(s)");
    });

    it("does not mention attributes when not provided", async () => {
      client.updateDomainContacts.mockResolvedValue({ verificationStatus: null });

      const result = (await server.getHandler("update_domain_contacts")({
        domain: "example.com",
        billing: "contact-billing-789",
      })) as ToolResult;

      expect(getText(result)).toContain("billing");
      expect(getText(result)).not.toContain("attribute");
    });

    it("returns error on failure", async () => {
      client.updateDomainContacts.mockRejectedValue(apiError);

      const result = (await server.getHandler("update_domain_contacts")({
        domain: "example.com",
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("set_privacy_level", () => {
    it("sets privacy to high", async () => {
      client.setPrivacyLevel.mockResolvedValue(undefined);

      const result = (await server.getHandler("set_privacy_level")({
        domain: "example.com", level: "high", userConsent: true,
      })) as ToolResult;

      expect(getText(result)).toContain("contact info hidden");
      expect(client.setPrivacyLevel).toHaveBeenCalledWith("example.com", "high", true);
    });

    it("sets privacy to public", async () => {
      client.setPrivacyLevel.mockResolvedValue(undefined);

      const result = (await server.getHandler("set_privacy_level")({
        domain: "example.com", level: "public", userConsent: true,
      })) as ToolResult;

      expect(getText(result)).toContain("contact info visible");
    });

    it("returns error on failure", async () => {
      client.setPrivacyLevel.mockRejectedValue(apiError);

      const result = (await server.getHandler("set_privacy_level")({
        domain: "example.com", level: "high", userConsent: true,
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("set_email_protection", () => {
    it("enables email protection", async () => {
      client.setEmailProtection.mockResolvedValue(undefined);

      const result = (await server.getHandler("set_email_protection")({
        domain: "example.com", contactForm: true,
      })) as ToolResult;

      expect(getText(result)).toContain("contact form enabled");
    });

    it("disables email protection", async () => {
      client.setEmailProtection.mockResolvedValue(undefined);

      const result = (await server.getHandler("set_email_protection")({
        domain: "example.com", contactForm: false,
      })) as ToolResult;

      expect(getText(result)).toContain("contact form disabled");
    });

    it("returns error on failure", async () => {
      client.setEmailProtection.mockRejectedValue(apiError);

      const result = (await server.getHandler("set_email_protection")({
        domain: "example.com", contactForm: true,
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });
});

describe("Personal Nameserver Tools", () => {
  let server: ReturnType<typeof createMockServer>;
  let client: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    server = createMockServer();
    client = createMockClient();
    registerPersonalNameserverTools(server as never, client as unknown as SpaceshipClient);
  });

  describe("list_personal_nameservers", () => {
    it("lists nameservers with IPs", async () => {
      client.listPersonalNameservers.mockResolvedValue([
        { host: "ns1.example.com", ips: ["1.2.3.4", "5.6.7.8"] },
        { host: "ns2.example.com", ips: ["9.10.11.12"] },
      ]);

      const result = (await server.getHandler("list_personal_nameservers")({
        domain: "example.com",
      })) as ToolResult;

      expect(getText(result)).toContain("ns1.example.com (1.2.3.4, 5.6.7.8)");
      expect(getText(result)).toContain("ns2.example.com (9.10.11.12)");
    });

    it("returns empty message when no nameservers", async () => {
      client.listPersonalNameservers.mockResolvedValue([]);

      const result = (await server.getHandler("list_personal_nameservers")({
        domain: "example.com",
      })) as ToolResult;

      expect(getText(result)).toContain("No personal nameservers configured");
    });

    it("handles nameserver without IPs", async () => {
      client.listPersonalNameservers.mockResolvedValue([
        { host: "ns1.example.com" },
      ]);

      const result = (await server.getHandler("list_personal_nameservers")({
        domain: "example.com",
      })) as ToolResult;

      expect(getText(result)).toContain("ns1.example.com");
      expect(getText(result)).not.toContain("(");
    });

    it("returns error on failure", async () => {
      client.listPersonalNameservers.mockRejectedValue(apiError);

      const result = (await server.getHandler("list_personal_nameservers")({
        domain: "example.com",
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("update_personal_nameserver", () => {
    it("updates nameserver successfully", async () => {
      client.updatePersonalNameserver.mockResolvedValue(undefined);

      const result = (await server.getHandler("update_personal_nameserver")({
        domain: "example.com", host: "ns1.example.com", ips: ["1.2.3.4", "5.6.7.8"],
      })) as ToolResult;

      expect(getText(result)).toContain("Updated personal nameserver ns1.example.com");
      expect(getText(result)).toContain("1.2.3.4, 5.6.7.8");
      expect(client.updatePersonalNameserver).toHaveBeenCalledWith("example.com", "ns1.example.com", ["1.2.3.4", "5.6.7.8"]);
    });

    it("returns error on failure", async () => {
      client.updatePersonalNameserver.mockRejectedValue(apiError);

      const result = (await server.getHandler("update_personal_nameserver")({
        domain: "example.com", host: "ns1.example.com", ips: ["1.2.3.4"],
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("get_personal_nameserver", () => {
    it("returns nameserver with IPs", async () => {
      client.getPersonalNameserver.mockResolvedValue({
        host: "ns1.example.com",
        ips: ["1.2.3.4", "5.6.7.8"],
      });

      const result = (await server.getHandler("get_personal_nameserver")({
        domain: "example.com",
        host: "ns1.example.com",
      })) as ToolResult;

      expect(getText(result)).toContain("ns1.example.com (1.2.3.4, 5.6.7.8)");
      expect(client.getPersonalNameserver).toHaveBeenCalledWith("example.com", "ns1.example.com");
    });

    it("returns nameserver without IPs", async () => {
      client.getPersonalNameserver.mockResolvedValue({
        host: "ns1.example.com",
      });

      const result = (await server.getHandler("get_personal_nameserver")({
        domain: "example.com",
        host: "ns1.example.com",
      })) as ToolResult;

      expect(getText(result)).toContain("ns1.example.com");
      expect(getText(result)).not.toContain("(");
    });

    it("returns error on failure", async () => {
      client.getPersonalNameserver.mockRejectedValue(apiError);

      const result = (await server.getHandler("get_personal_nameserver")({
        domain: "example.com",
        host: "ns1.example.com",
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("delete_personal_nameserver", () => {
    it("deletes nameserver successfully", async () => {
      client.deletePersonalNameserver.mockResolvedValue(undefined);

      const result = (await server.getHandler("delete_personal_nameserver")({
        domain: "example.com", host: "ns1.example.com",
      })) as ToolResult;

      expect(getText(result)).toContain("Deleted personal nameserver ns1.example.com");
      expect(client.deletePersonalNameserver).toHaveBeenCalledWith("example.com", "ns1.example.com");
    });

    it("returns error on failure", async () => {
      client.deletePersonalNameserver.mockRejectedValue(apiError);

      const result = (await server.getHandler("delete_personal_nameserver")({
        domain: "example.com", host: "ns1.example.com",
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });
});

describe("SellerHub Tools", () => {
  let server: ReturnType<typeof createMockServer>;
  let client: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    server = createMockServer();
    client = createMockClient();
    registerSellerHubTools(server as never, client as unknown as SpaceshipClient);
  });

  describe("list_sellerhub_domains", () => {
    it("fetches all domains including ones without status or pricing", async () => {
      client.listAllSellerHubDomains.mockResolvedValue([
        { name: "premium.com", status: "active", binPrice: { amount: "9999", currency: "USD" } },
        { name: "cheap.com", status: "verifying" },
        { name: "bare.com" },
      ]);

      const result = (await server.getHandler("list_sellerhub_domains")({
        fetchAll: true, take: 100, skip: 0,
      })) as ToolResult;

      expect(getText(result)).toContain("Total SellerHub domains: 3");
      expect(getText(result)).toContain("premium.com [active]");
      expect(getText(result)).toContain("BIN: USD 9999");
      expect(getText(result)).toContain("cheap.com [verifying]");
      // bare.com has no status/pricing - formatDomain branches
      expect(getText(result)).toContain("bare.com");
    });

    it("fetches paginated domains when fetchAll=false", async () => {
      client.listSellerHubDomains.mockResolvedValue({
        items: [{ name: "test.com", status: "active", minPrice: { amount: "100", currency: "EUR" } }],
        total: 3,
      });

      const result = (await server.getHandler("list_sellerhub_domains")({
        fetchAll: false, take: 1, skip: 0,
      })) as ToolResult;

      expect(getText(result)).toContain("Total: 3");
      expect(getText(result)).toContain("showing 1");
      expect(getText(result)).toContain("min: EUR 100");
    });

    it("returns error on failure", async () => {
      client.listAllSellerHubDomains.mockRejectedValue(apiError);

      const result = (await server.getHandler("list_sellerhub_domains")({
        fetchAll: true, take: 100, skip: 0,
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("create_sellerhub_domain", () => {
    it("creates listing successfully", async () => {
      client.createSellerHubDomain.mockResolvedValue({ name: "newlisting.com", status: "verifying" });

      const result = (await server.getHandler("create_sellerhub_domain")({
        domain: "newlisting.com",
      })) as ToolResult;

      expect(getText(result)).toContain("Listed newlisting.com on SellerHub [verifying]");
    });

    it("handles missing status", async () => {
      client.createSellerHubDomain.mockResolvedValue({ name: "test.com" });

      const result = (await server.getHandler("create_sellerhub_domain")({
        domain: "test.com",
      })) as ToolResult;

      expect(getText(result)).toContain("Listed test.com on SellerHub [pending]");
    });

    it("passes all optional fields", async () => {
      client.createSellerHubDomain.mockResolvedValue({ name: "test.com", status: "verifying" });

      await server.getHandler("create_sellerhub_domain")({
        domain: "test.com",
        displayName: "Test Domain",
        description: "A great domain",
        binPriceEnabled: true,
        binPrice: { amount: "9999", currency: "USD" },
        minPriceEnabled: true,
        minPrice: { amount: "100", currency: "USD" },
      });

      expect(client.createSellerHubDomain).toHaveBeenCalledWith({
        name: "test.com",
        displayName: "Test Domain",
        description: "A great domain",
        binPriceEnabled: true,
        binPrice: { amount: "9999", currency: "USD" },
        minPriceEnabled: true,
        minPrice: { amount: "100", currency: "USD" },
      });
    });

    it("returns error on failure", async () => {
      client.createSellerHubDomain.mockRejectedValue(apiError);

      const result = (await server.getHandler("create_sellerhub_domain")({
        domain: "test.com",
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("get_sellerhub_domain", () => {
    it("returns full listing details", async () => {
      client.getSellerHubDomain.mockResolvedValue({
        name: "premium.com",
        displayName: "Premium Domain",
        status: "active",
        description: "A great domain",
        binPriceEnabled: true,
        binPrice: { amount: "9999", currency: "USD" },
        minPriceEnabled: false,
        minPrice: { amount: "100", currency: "USD" },
      });

      const result = (await server.getHandler("get_sellerhub_domain")({
        domain: "premium.com",
      })) as ToolResult;

      const text = getText(result);
      expect(text).toContain("Domain: premium.com");
      expect(text).toContain("Display name: Premium Domain");
      expect(text).toContain("Status: active");
      expect(text).toContain("Description: A great domain");
      expect(text).toContain("BIN price: USD 9999 (enabled)");
      expect(text).toContain("Min price: USD 100 (disabled)");
    });

    it("returns listing without optional fields", async () => {
      client.getSellerHubDomain.mockResolvedValue({
        name: "bare.com",
        binPriceEnabled: false,
        minPriceEnabled: false,
      });

      const result = (await server.getHandler("get_sellerhub_domain")({
        domain: "bare.com",
      })) as ToolResult;

      const text = getText(result);
      expect(text).toContain("Domain: bare.com");
      expect(text).not.toContain("Display name:");
      expect(text).not.toContain("Status:");
      expect(text).not.toContain("Description:");
      expect(text).toContain("BIN price: not set (disabled)");
      expect(text).toContain("Min price: not set (disabled)");
    });

    it("returns listing with description but no displayName or status", async () => {
      client.getSellerHubDomain.mockResolvedValue({
        name: "desc-only.com",
        description: "Some description",
        binPriceEnabled: true,
        binPrice: { amount: "500", currency: "EUR" },
        minPriceEnabled: true,
        minPrice: { amount: "50", currency: "EUR" },
      });

      const result = (await server.getHandler("get_sellerhub_domain")({
        domain: "desc-only.com",
      })) as ToolResult;

      const text = getText(result);
      expect(text).toContain("Description: Some description");
      expect(text).not.toContain("Display name:");
      expect(text).not.toContain("Status:");
      expect(text).toContain("BIN price: EUR 500 (enabled)");
      expect(text).toContain("Min price: EUR 50 (enabled)");
    });

    it("returns error on failure", async () => {
      client.getSellerHubDomain.mockRejectedValue(apiError);

      const result = (await server.getHandler("get_sellerhub_domain")({
        domain: "test.com",
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("update_sellerhub_domain", () => {
    it("updates listing successfully", async () => {
      client.updateSellerHubDomain.mockResolvedValue({
        name: "premium.com",
        status: "active",
        binPrice: { amount: "4999", currency: "USD" },
      });

      const result = (await server.getHandler("update_sellerhub_domain")({
        domain: "premium.com",
        description: "Updated description",
        binPriceEnabled: true,
        binPrice: { amount: "4999", currency: "USD" },
      })) as ToolResult;

      expect(getText(result)).toContain("Updated SellerHub listing premium.com");
      expect(getText(result)).toContain("BIN: USD 4999");
    });

    it("passes displayName to client", async () => {
      client.updateSellerHubDomain.mockResolvedValue({
        name: "premium.com",
        displayName: "Premium Domain",
      });

      const result = (await server.getHandler("update_sellerhub_domain")({
        domain: "premium.com",
        displayName: "Premium Domain",
      })) as ToolResult;

      expect(getText(result)).toContain("Updated SellerHub listing premium.com");
      expect(client.updateSellerHubDomain).toHaveBeenCalledWith(
        "premium.com",
        expect.objectContaining({ displayName: "Premium Domain" }),
      );
    });

    it("returns error on failure", async () => {
      client.updateSellerHubDomain.mockRejectedValue(apiError);

      const result = (await server.getHandler("update_sellerhub_domain")({
        domain: "test.com",
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("delete_sellerhub_domain", () => {
    it("deletes listing successfully", async () => {
      client.deleteSellerHubDomain.mockResolvedValue(undefined);

      const result = (await server.getHandler("delete_sellerhub_domain")({
        domain: "old-listing.com",
      })) as ToolResult;

      expect(getText(result)).toContain("Removed old-listing.com from SellerHub");
    });

    it("returns error on failure", async () => {
      client.deleteSellerHubDomain.mockRejectedValue(apiError);

      const result = (await server.getHandler("delete_sellerhub_domain")({
        domain: "test.com",
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("create_checkout_link", () => {
    it("creates checkout link successfully", async () => {
      client.createCheckoutLink.mockResolvedValue({ url: "https://spaceship.com/checkout/abc123" });

      const result = (await server.getHandler("create_checkout_link")({
        domain: "forsale.com", type: "buyNow",
      })) as ToolResult;

      expect(getText(result)).toContain("Checkout link for forsale.com");
      expect(getText(result)).toContain("https://spaceship.com/checkout/abc123");
      expect(client.createCheckoutLink).toHaveBeenCalledWith({
        type: "buyNow",
        domainName: "forsale.com",
      });
    });

    it("includes validTill when present", async () => {
      client.createCheckoutLink.mockResolvedValue({
        url: "https://spaceship.com/checkout/abc123",
        validTill: "2025-12-31",
      });

      const result = (await server.getHandler("create_checkout_link")({
        domain: "forsale.com", type: "buyNow",
      })) as ToolResult;

      expect(getText(result)).toContain("Valid until: 2025-12-31");
    });

    it("passes basePrice when provided", async () => {
      client.createCheckoutLink.mockResolvedValue({ url: "https://spaceship.com/checkout/abc123" });

      await server.getHandler("create_checkout_link")({
        domain: "forsale.com", type: "buyNow", basePrice: { amount: "5000", currency: "USD" },
      });

      expect(client.createCheckoutLink).toHaveBeenCalledWith({
        type: "buyNow",
        domainName: "forsale.com",
        basePrice: { amount: "5000", currency: "USD" },
      });
    });

    it("returns error on failure", async () => {
      client.createCheckoutLink.mockRejectedValue(apiError);

      const result = (await server.getHandler("create_checkout_link")({
        domain: "test.com", type: "buyNow",
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });

  describe("get_verification_records", () => {
    it("returns verification records", async () => {
      client.getVerificationRecords.mockResolvedValue({
        options: [{
          records: [
            { type: "TXT", name: "@", value: "spaceship-verify=abc123" },
            { type: "CNAME", name: "_verify", value: "verify.spaceship.com" },
          ],
        }],
      });

      const result = (await server.getHandler("get_verification_records")({})) as ToolResult;

      expect(getText(result)).toContain("Verification options (1):");
      expect(getText(result)).toContain("TXT @");
      expect(getText(result)).toContain("spaceship-verify=abc123");
      expect(getText(result)).toContain("CNAME _verify");
    });

    it("returns message when no verification records", async () => {
      client.getVerificationRecords.mockResolvedValue({
        options: [{ records: [] }],
      });

      const result = (await server.getHandler("get_verification_records")({})) as ToolResult;

      expect(getText(result)).toBe("No verification records found.");
    });

    it("returns error on failure", async () => {
      client.getVerificationRecords.mockRejectedValue(apiError);

      const result = (await server.getHandler("get_verification_records")({
        domain: "test.com",
      })) as ToolResult;

      expect(result.isError).toBe(true);
    });
  });
});

describe("Tool registration counts", () => {
  it("registers the correct number of tools per module", () => {
    const server = createMockServer();
    const client = createMockClient() as unknown as SpaceshipClient;

    registerAnalysisTools(server as never, client);
    expect(server.registerTool).toHaveBeenCalledTimes(1);

    server.registerTool.mockClear();
    registerDnsRecordTools(server as never, client);
    expect(server.registerTool).toHaveBeenCalledTimes(3);

    server.registerTool.mockClear();
    registerDnsRecordCreatorTools(server as never, client);
    expect(server.registerTool).toHaveBeenCalledTimes(13);

    server.registerTool.mockClear();
    registerDomainManagementTools(server as never, client);
    expect(server.registerTool).toHaveBeenCalledTimes(7);

    server.registerTool.mockClear();
    registerDomainLifecycleTools(server as never, client);
    expect(server.registerTool).toHaveBeenCalledTimes(6);

    server.registerTool.mockClear();
    registerContactsPrivacyTools(server as never, client);
    expect(server.registerTool).toHaveBeenCalledTimes(7);

    server.registerTool.mockClear();
    registerPersonalNameserverTools(server as never, client);
    expect(server.registerTool).toHaveBeenCalledTimes(4);

    server.registerTool.mockClear();
    registerSellerHubTools(server as never, client);
    expect(server.registerTool).toHaveBeenCalledTimes(7);
  });
});
