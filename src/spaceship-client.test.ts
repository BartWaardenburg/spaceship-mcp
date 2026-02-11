import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SpaceshipClient, SpaceshipApiError } from "./spaceship-client.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const jsonResponse = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const emptyResponse = (): Response => new Response(null, { status: 204 });

describe("SpaceshipClient", () => {
  let client: SpaceshipClient;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    mockFetch.mockReset();
    client = new SpaceshipClient("test-key", "test-secret", "https://api.test.com");
  });

  describe("request building", () => {
    it("sends auth headers on every request", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }));

      await client.listDnsRecords("example.com", { take: 10, skip: 0 });

      const [, init] = mockFetch.mock.calls[0];
      const headers = init.headers as Headers;
      expect(headers.get("X-API-Key")).toBe("test-key");
      expect(headers.get("X-API-Secret")).toBe("test-secret");
      expect(headers.get("Content-Type")).toBe("application/json");
    });

    it("encodes domain in URL path", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }));

      await client.listDnsRecords("ex ample.com", { take: 10, skip: 0 });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("ex%20ample.com");
    });

    it("strips trailing slash from baseUrl", () => {
      const c = new SpaceshipClient("k", "s", "https://api.test.com/");
      // The baseUrl should have the trailing slash removed
      // We can verify by making a request
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }));
      c.listDnsRecords("example.com", { take: 10, skip: 0 });
      const [url] = mockFetch.mock.calls[0];
      expect(url).not.toContain("//v1");
    });
  });

  describe("listDnsRecords", () => {
    it("builds correct query params", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }));

      await client.listDnsRecords("example.com", { take: 100, skip: 50, orderBy: "name" });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("take=100");
      expect(url).toContain("skip=50");
      expect(url).toContain("orderBy=name");
    });
  });

  describe("listAllDnsRecords", () => {
    it("paginates through all pages", async () => {
      const page1 = Array.from({ length: 500 }, (_, i) => ({
        type: "A",
        name: `r${i}`,
        address: "1.2.3.4",
      }));
      const page2 = [{ type: "A", name: "last", address: "1.2.3.4" }];

      mockFetch
        .mockResolvedValueOnce(jsonResponse({ items: page1, total: 501 }))
        .mockResolvedValueOnce(jsonResponse({ items: page2, total: 501 }));

      const result = await client.listAllDnsRecords("example.com");

      expect(result).toHaveLength(501);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("stops on empty page", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }));

      const result = await client.listAllDnsRecords("example.com");

      expect(result).toHaveLength(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("passes orderBy query param when provided", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }));

      await client.listAllDnsRecords("example.com", "name");

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("orderBy=name");
    });
  });

  describe("saveDnsRecords", () => {
    it("sends PUT with force:true when no conflicts exist", async () => {
      // First call: listAllDnsRecords (no conflicts)
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ items: [{ name: "@", type: "TXT", value: "unrelated", ttl: 300 }], total: 1 }),
      );
      // Second call: PUT
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        { type: "A", name: "@", address: "1.2.3.4", ttl: 300 },
      ]);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [, init] = mockFetch.mock.calls[1];
      expect(init.method).toBe("PUT");
      const body = JSON.parse(init.body);
      expect(body.force).toBe(true);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].type).toBe("A");
    });

    it("deletes conflicting records before saving", async () => {
      // First call: listAllDnsRecords (has conflicting CNAME)
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          items: [
            { name: "www", type: "CNAME", cname: "old-target.example.com", ttl: 3600 },
            { name: "@", type: "MX", exchange: "mail.example.com", preference: 10, ttl: 3600 },
          ],
          total: 2,
        }),
      );
      // Second call: DELETE conflicting
      mockFetch.mockResolvedValueOnce(emptyResponse());
      // Third call: PUT new records
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        { type: "CNAME", name: "www", cname: "new-target.example.com", ttl: 300 },
      ]);

      expect(mockFetch).toHaveBeenCalledTimes(3);

      const [, deleteInit] = mockFetch.mock.calls[1];
      expect(deleteInit.method).toBe("DELETE");
      const deleteBody = JSON.parse(deleteInit.body);
      expect(deleteBody).toHaveLength(1);
      expect(deleteBody[0].name).toBe("www");
      expect(deleteBody[0].type).toBe("CNAME");

      const [, putInit] = mockFetch.mock.calls[2];
      expect(putInit.method).toBe("PUT");
      const putBody = JSON.parse(putInit.body);
      expect(putBody.items[0].cname).toBe("new-target.example.com");
    });

    it("skips delete when no existing records at all", async () => {
      // First call: listAllDnsRecords (empty)
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }));
      // Second call: PUT
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        { type: "A", name: "@", address: "1.2.3.4", ttl: 300 },
      ]);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [, init] = mockFetch.mock.calls[1];
      expect(init.method).toBe("PUT");
    });
  });

  describe("deleteDnsRecords", () => {
    it("fetches existing records then sends DELETE with full record data", async () => {
      // First call: listAllDnsRecords (fetches existing)
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          items: [
            { name: "@", type: "A", address: "1.2.3.4", ttl: 300 },
            { name: "@", type: "TXT", value: "test", ttl: 300 },
          ],
          total: 2,
        }),
      );
      // Second call: DELETE
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.deleteDnsRecords("example.com", [{ name: "@", type: "A" }]);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [, deleteInit] = mockFetch.mock.calls[1];
      expect(deleteInit.method).toBe("DELETE");
      const body = JSON.parse(deleteInit.body);
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe("@");
      expect(body[0].type).toBe("A");
      expect(body[0].address).toBe("1.2.3.4");
    });

    it("skips DELETE when no matching records found", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ items: [], total: 0 }),
      );

      await client.deleteDnsRecords("example.com", [{ name: "@", type: "A" }]);

      // Only the list call, no DELETE
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling", () => {
    it("throws SpaceshipApiError on non-ok response with JSON body", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "NOT_FOUND" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      );

      await expect(client.getDomain("nonexistent.com")).rejects.toThrow(SpaceshipApiError);

      try {
        mockFetch.mockResolvedValueOnce(
          new Response(JSON.stringify({ code: "NOT_FOUND" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          }),
        );
        await client.getDomain("nonexistent.com");
      } catch (e) {
        expect(e).toBeInstanceOf(SpaceshipApiError);
        expect((e as SpaceshipApiError).status).toBe(404);
      }
    });

    it("handles 204 no-content response", async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      // setAutoRenew returns Promise<void>, so await should not throw
      await expect(client.setAutoRenew("example.com", true)).resolves.toBeUndefined();
    });
  });

  describe("domain operations", () => {
    it("checkDomainAvailability calls correct endpoint and maps result", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ domain: "test.com", result: "available", premiumPricing: [] }),
      );

      const result = await client.checkDomainAvailability("test.com");

      expect(result.available).toBe(true);
      expect(result.result).toBe("available");
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/v1/domains/test.com/available");
    });

    it("checkDomainAvailability maps taken result to available=false", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ domain: "taken.com", result: "taken", premiumPricing: [] }),
      );

      const result = await client.checkDomainAvailability("taken.com");

      expect(result.available).toBe(false);
      expect(result.result).toBe("taken");
    });

    it("checkDomainsAvailability posts with domains field", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          domains: [
            { domain: "a.com", result: "available", premiumPricing: [] },
            { domain: "b.com", result: "taken", premiumPricing: [] },
          ],
        }),
      );

      const result = await client.checkDomainsAvailability(["a.com", "b.com"]);

      expect(result).toHaveLength(2);
      expect(result[0].available).toBe(true);
      expect(result[1].available).toBe(false);
      const [, init] = mockFetch.mock.calls[0];
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body);
      expect(body.domains).toEqual(["a.com", "b.com"]);
    });

    it("updateNameservers sends PUT with custom provider and hosts", async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.updateNameservers("example.com", ["ns1.fly.io", "ns2.fly.io"]);

      const [, init] = mockFetch.mock.calls[0];
      expect(init.method).toBe("PUT");
      const body = JSON.parse(init.body);
      expect(body.provider).toBe("custom");
      expect(body.hosts).toEqual(["ns1.fly.io", "ns2.fly.io"]);
    });

    it("setPrivacyLevel sends PUT with privacyLevel and userConsent", async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.setPrivacyLevel("example.com", "high", true);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/privacy/preference");
      expect(init.method).toBe("PUT");
      const body = JSON.parse(init.body);
      expect(body.privacyLevel).toBe("high");
      expect(body.userConsent).toBe(true);
    });

    it("updatePersonalNameserver sends host in body", async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.updatePersonalNameserver("example.com", "ns1.example.com", ["1.2.3.4"]);

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.host).toBe("ns1.example.com");
      expect(body.ips).toEqual(["1.2.3.4"]);
    });

    it("createSellerHubDomain sends request object", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ name: "example.com", status: "verifying" }),
      );

      const result = await client.createSellerHubDomain({ name: "example.com" });

      expect(result.name).toBe("example.com");
      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.name).toBe("example.com");
    });

    it("createSellerHubDomain sends optional fields", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ name: "example.com", status: "verifying" }),
      );

      await client.createSellerHubDomain({
        name: "example.com",
        displayName: "Example",
        binPrice: { amount: "9999", currency: "USD" },
        binPriceEnabled: true,
      });

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.name).toBe("example.com");
      expect(body.displayName).toBe("Example");
      expect(body.binPrice).toEqual({ amount: "9999", currency: "USD" });
      expect(body.binPriceEnabled).toBe(true);
    });

    it("updateSellerHubDomain sends pricing objects", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ name: "example.com", binPrice: { amount: "9999", currency: "USD" } }),
      );

      await client.updateSellerHubDomain("example.com", {
        binPrice: { amount: "9999", currency: "USD" },
      });

      const [, init] = mockFetch.mock.calls[0];
      expect(init.method).toBe("PATCH");
      const body = JSON.parse(init.body);
      expect(body.binPrice).toEqual({ amount: "9999", currency: "USD" });
    });

    it("createCheckoutLink sends type and domainName", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ url: "https://example.com/checkout" }));

      await client.createCheckoutLink({ type: "buyNow", domainName: "example.com" });

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.type).toBe("buyNow");
      expect(body.domainName).toBe("example.com");
    });

    it("deleteDomain sends DELETE request", async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.deleteDomain("example.com");

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/v1/domains/example.com");
      expect(init.method).toBe("DELETE");
    });

    it("getPersonalNameserver fetches single NS", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ host: "ns1.example.com", ips: ["1.2.3.4"] }),
      );

      const result = await client.getPersonalNameserver("example.com", "ns1.example.com");

      expect(result.host).toBe("ns1.example.com");
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/personal-nameservers/ns1.example.com");
    });

    it("getVerificationRecords fetches account-level records", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ options: [{ records: [{ type: "TXT", name: "@", value: "verify=abc" }] }] }),
      );

      const result = await client.getVerificationRecords();

      expect(result.options).toHaveLength(1);
      expect(result.options[0].records[0].value).toBe("verify=abc");
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/v1/sellerhub/verification-records");
      expect(url).not.toContain("/domains/");
    });

    it("saveContact returns SaveContactResponse with contactId", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ contactId: "contact-123" }));

      const result = await client.saveContact({
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        address1: "123 Main St",
        city: "NYC",
        country: "US",
        postalCode: "10001",
        phone: "+1.1234567890",
      });

      expect(result.contactId).toBe("contact-123");
      expect(result).not.toHaveProperty("firstName");
    });

    it("getAuthCode returns authCode and expires", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ authCode: "ABC123", expires: "2025-12-31T00:00:00Z" }),
      );

      const result = await client.getAuthCode("example.com");

      expect(result.authCode).toBe("ABC123");
      expect(result.expires).toBe("2025-12-31T00:00:00Z");
    });

    it("createCheckoutLink sends basePrice when provided", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ url: "https://example.com/checkout", validTill: "2025-12-31" }),
      );

      await client.createCheckoutLink({
        type: "buyNow",
        domainName: "example.com",
        basePrice: { amount: "5000", currency: "USD" },
      });

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.basePrice).toEqual({ amount: "5000", currency: "USD" });
    });

    it("saveContactAttributes sends flat object", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ contactId: "abc123" }));

      const result = await client.saveContactAttributes({ type: "us", appPurpose: "P1" });

      expect(result.contactId).toBe("abc123");
      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.type).toBe("us");
      expect(body.appPurpose).toBe("P1");
    });

    it("updateNameservers sends PUT with basic provider without hosts", async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.updateNameservers("example.com", [], "basic");

      const [, init] = mockFetch.mock.calls[0];
      expect(init.method).toBe("PUT");
      const body = JSON.parse(init.body);
      expect(body.provider).toBe("basic");
      expect(body).not.toHaveProperty("hosts");
    });
  });

  describe("listPersonalNameservers", () => {
    it("extracts records from response wrapper", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          records: [
            { host: "ns1.example.com", ips: ["1.2.3.4"] },
            { host: "ns2.example.com", ips: ["5.6.7.8"] },
          ],
        }),
      );

      const result = await client.listPersonalNameservers("example.com");

      expect(result).toHaveLength(2);
      expect(result[0].host).toBe("ns1.example.com");
    });

    it("returns empty array when no records", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ records: [] }));

      const result = await client.listPersonalNameservers("example.com");

      expect(result).toHaveLength(0);
    });
  });

  describe("listAllSellerHubDomains", () => {
    it("paginates through all pages", async () => {
      const page1 = Array.from({ length: 100 }, (_, i) => ({
        id: `id-${i}`,
        domain: `domain${i}.com`,
      }));
      const page2 = [{ id: "id-100", domain: "domain100.com" }];

      mockFetch
        .mockResolvedValueOnce(jsonResponse({ items: page1, total: 101 }))
        .mockResolvedValueOnce(jsonResponse({ items: page2, total: 101 }));

      const result = await client.listAllSellerHubDomains();

      expect(result).toHaveLength(101);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("stops on empty page", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }));

      const result = await client.listAllSellerHubDomains();

      expect(result).toHaveLength(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("lifecycle operations (requestWithAsyncHeader)", () => {
    const asyncResponse = (operationId: string): Response =>
      new Response(null, {
        status: 202,
        headers: {
          "spaceship-async-operationid": operationId,
          "content-type": "application/json",
        },
      });

    it("registerDomain returns operationId from header", async () => {
      mockFetch.mockResolvedValueOnce(asyncResponse("op-reg-1"));

      const result = await client.registerDomain("example.com", { years: 1 });

      expect(result.operationId).toBe("op-reg-1");
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/v1/domains/example.com");
      expect(init.method).toBe("POST");
    });

    it("renewDomain returns operationId from header", async () => {
      mockFetch.mockResolvedValueOnce(asyncResponse("op-renew-1"));

      const result = await client.renewDomain("example.com", {
        years: 1,
        currentExpirationDate: "2025-12-31",
      });

      expect(result.operationId).toBe("op-renew-1");
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/v1/domains/example.com/renew");
      expect(init.method).toBe("POST");
    });

    it("restoreDomain returns operationId from header", async () => {
      mockFetch.mockResolvedValueOnce(asyncResponse("op-restore-1"));

      const result = await client.restoreDomain("example.com");

      expect(result.operationId).toBe("op-restore-1");
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/v1/domains/example.com/restore");
    });

    it("transferDomain returns operationId from header", async () => {
      mockFetch.mockResolvedValueOnce(asyncResponse("op-transfer-1"));

      const result = await client.transferDomain("example.com", {
        authCode: "AUTH123",
        autoRenew: true,
      });

      expect(result.operationId).toBe("op-transfer-1");
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/v1/domains/example.com/transfer");
      expect(init.method).toBe("POST");
    });

    it("returns empty operationId when header missing", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 202 }));

      const result = await client.registerDomain("example.com", { years: 1 });

      expect(result.operationId).toBe("");
    });
  });

  describe("additional client methods", () => {
    it("listDomains sends query params with orderBy", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ items: [{ name: "example.com" }], total: 1 }),
      );

      const result = await client.listDomains({ take: 10, skip: 5, orderBy: "name" });

      expect(result.total).toBe(1);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("take=10");
      expect(url).toContain("skip=5");
      expect(url).toContain("orderBy=name");
    });

    it("listDomains sends query params without orderBy", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ items: [], total: 0 }),
      );

      await client.listDomains({ take: 10, skip: 0 });

      const [url] = mockFetch.mock.calls[0];
      expect(url).not.toContain("orderBy");
    });

    it("listAllDomains paginates through all pages", async () => {
      const page1 = Array.from({ length: 100 }, (_, i) => ({ name: `d${i}.com` }));
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ items: page1, total: 101 }))
        .mockResolvedValueOnce(jsonResponse({ items: [{ name: "last.com" }], total: 101 }));

      const result = await client.listAllDomains("name");

      expect(result).toHaveLength(101);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("listAllDomains without orderBy omits query param", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }));

      await client.listAllDomains();

      const [url] = mockFetch.mock.calls[0];
      expect(url).not.toContain("orderBy");
    });

    it("setTransferLock sends PUT with isLocked", async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.setTransferLock("example.com", true);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/transfer/lock");
      expect(init.method).toBe("PUT");
      const body = JSON.parse(init.body);
      expect(body.isLocked).toBe(true);
    });

    it("setEmailProtection sends PUT with contactForm", async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.setEmailProtection("example.com", true);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/email-protection-preference");
      expect(init.method).toBe("PUT");
      const body = JSON.parse(init.body);
      expect(body.contactForm).toBe(true);
    });

    it("updateDomainContacts sends PUT with contact IDs and returns verificationStatus", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ verificationStatus: "success" }),
      );

      const result = await client.updateDomainContacts("example.com", {
        registrant: "c-1",
        admin: "c-2",
      });

      expect(result.verificationStatus).toBe("success");
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/v1/domains/example.com/contacts");
      expect(init.method).toBe("PUT");
      const body = JSON.parse(init.body);
      expect(body.registrant).toBe("c-1");
      expect(body.admin).toBe("c-2");
    });

    it("updateDomainContacts returns null verificationStatus on 204", async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      const result = await client.updateDomainContacts("example.com", {
        registrant: "c-1",
      });

      expect(result.verificationStatus).toBeNull();
    });

    it("getContact fetches contact by ID", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ contactId: "c-1", firstName: "John", lastName: "Doe" }),
      );

      const result = await client.getContact("c-1");

      expect(result.firstName).toBe("John");
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/v1/contacts/c-1");
    });

    it("getContactAttributes returns flat attribute object", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ type: "us", appPurpose: "P1" }),
      );

      const result = await client.getContactAttributes("c-1");

      expect(result.type).toBe("us");
      expect(result.appPurpose).toBe("P1");
    });

    it("getAsyncOperation fetches by operationId", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ status: "success", type: "domain_registration" }),
      );

      const result = await client.getAsyncOperation("op-1");

      expect(result.status).toBe("success");
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/v1/async-operations/op-1");
    });

    it("getTransferStatus fetches transfer info", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ status: "pending" }));

      const result = await client.getTransferStatus("example.com");

      expect(result.status).toBe("pending");
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/v1/domains/example.com/transfer");
    });

    it("deletePersonalNameserver sends DELETE", async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.deletePersonalNameserver("example.com", "ns1.example.com");

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/personal-nameservers/ns1.example.com");
      expect(init.method).toBe("DELETE");
    });

    it("listSellerHubDomains sends query params", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ items: [{ name: "sale.com" }], total: 1 }),
      );

      const result = await client.listSellerHubDomains({ take: 10, skip: 0 });

      expect(result.total).toBe(1);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/v1/sellerhub/domains?");
      expect(url).toContain("take=10");
    });

    it("getSellerHubDomain fetches by name", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ name: "sale.com", status: "active" }),
      );

      const result = await client.getSellerHubDomain("sale.com");

      expect(result.name).toBe("sale.com");
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/v1/sellerhub/domains/sale.com");
    });

    it("deleteSellerHubDomain sends DELETE", async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.deleteSellerHubDomain("sale.com");

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/v1/sellerhub/domains/sale.com");
      expect(init.method).toBe("DELETE");
    });

    it("deleteDomain sends DELETE", async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.deleteDomain("example.com");

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/v1/domains/example.com");
      expect(init.method).toBe("DELETE");
    });
  });

  describe("rate limit retry", () => {
    it("retries on 429 with exponential backoff", async () => {
      vi.useFakeTimers();

      const rateLimited = () =>
        new Response(JSON.stringify({ code: "RATE_LIMITED" }), {
          status: 429,
          headers: { "content-type": "application/json" },
        });

      mockFetch
        .mockResolvedValueOnce(rateLimited())
        .mockResolvedValueOnce(jsonResponse({ name: "example.com" }));

      const promise = client.getDomain("example.com");
      await vi.advanceTimersByTimeAsync(1000);
      const result = await promise;

      expect(result.name).toBe("example.com");
      expect(mockFetch).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("respects Retry-After header", async () => {
      vi.useFakeTimers();

      const rateLimited = new Response(JSON.stringify({ code: "RATE_LIMITED" }), {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "5" },
      });

      mockFetch
        .mockResolvedValueOnce(rateLimited)
        .mockResolvedValueOnce(jsonResponse({ name: "example.com" }));

      const promise = client.getDomain("example.com");

      // Should not resolve after 4s
      await vi.advanceTimersByTimeAsync(4000);
      // Should resolve after 5s
      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;
      expect(result.name).toBe("example.com");
      expect(mockFetch).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("throws after exhausting all retries", async () => {
      const singleRetry = new SpaceshipClient("k", "s", "https://api.test.com", { maxRetries: 1 });

      vi.useFakeTimers();

      const make429 = () =>
        new Response(JSON.stringify({ code: "RATE_LIMITED" }), {
          status: 429,
          headers: { "content-type": "application/json" },
        });

      mockFetch
        .mockResolvedValueOnce(make429())
        .mockResolvedValueOnce(make429());

      const promise = singleRetry.getDomain("example.com").catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(1000);

      const error = await promise;
      expect(error).toBeInstanceOf(SpaceshipApiError);
      expect((error as SpaceshipApiError).status).toBe(429);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("does not retry non-429 errors", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "NOT_FOUND" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      );

      await expect(client.getDomain("example.com")).rejects.toThrow(SpaceshipApiError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("retries can be disabled with maxRetries=0", async () => {
      const noRetry = new SpaceshipClient("k", "s", "https://api.test.com", { maxRetries: 0 });

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "RATE_LIMITED" }), {
          status: 429,
          headers: { "content-type": "application/json" },
        }),
      );

      await expect(noRetry.getDomain("example.com")).rejects.toThrow(SpaceshipApiError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling with text response", () => {
    it("throws SpaceshipApiError with text body on non-JSON error", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Internal Server Error", {
          status: 500,
          headers: { "content-type": "text/plain" },
        }),
      );

      try {
        await client.getDomain("example.com");
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(SpaceshipApiError);
        expect((e as SpaceshipApiError).status).toBe(500);
        expect((e as SpaceshipApiError).details).toBe("Internal Server Error");
      }
    });

    it("handles malformed JSON error response gracefully", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("not-valid-json{", {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      );

      try {
        await client.getDomain("example.com");
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(SpaceshipApiError);
        expect((e as SpaceshipApiError).details).toBeNull();
      }
    });

    it("handles error response without content-type header", async () => {
      const res = new Response("No content type", { status: 500 });
      res.headers.delete("content-type");
      mockFetch.mockResolvedValueOnce(res);

      try {
        await client.getDomain("example.com");
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(SpaceshipApiError);
        expect((e as SpaceshipApiError).details).toBe("No content type");
      }
    });

    it("handles unreadable text error response gracefully", async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.error(new Error("stream error"));
        },
      });

      mockFetch.mockResolvedValueOnce(
        new Response(stream, {
          status: 500,
          headers: { "content-type": "text/plain" },
        }),
      );

      try {
        await client.getDomain("example.com");
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(SpaceshipApiError);
        expect((e as SpaceshipApiError).details).toBe("");
      }
    });
  });

  describe("buildRecordPayload (via saveDnsRecords)", () => {
    const emptyList = () => jsonResponse({ items: [], total: 0 });

    it("builds MX record from preference/exchange", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        { type: "MX", name: "@", preference: 10, exchange: "mail.example.com", ttl: 3600 },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.items[0].preference).toBe(10);
      expect(body.items[0].exchange).toBe("mail.example.com");
    });

    it("builds MX record from value string", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        { type: "MX", name: "@", value: "10 mail.example.com", ttl: 3600 },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.items[0].preference).toBe(10);
      expect(body.items[0].exchange).toBe("mail.example.com");
    });

    it("builds SRV record from structured fields", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        {
          type: "SRV",
          name: "_sip._tcp",
          priority: 10,
          weight: 60,
          port: 5060,
          target: "sip.example.com",
        },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.items[0].priority).toBe(10);
      expect(body.items[0].service).toBe("_sip");
      expect(body.items[0].protocol).toBe("_tcp");
    });

    it("builds CNAME from cname field", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        { type: "CNAME", name: "www", cname: "example.com" },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.items[0].cname).toBe("example.com");
    });

    it("throws for invalid MX value format", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());

      await expect(
        client.saveDnsRecords("example.com", [{ type: "MX", name: "@", value: "invalid" }]),
      ).rejects.toThrow("Invalid MX record format");
    });

    it("throws for MX without required fields", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());

      await expect(
        client.saveDnsRecords("example.com", [{ type: "MX", name: "@" }]),
      ).rejects.toThrow("MX record must have");
    });

    it("throws for SRV without required fields", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());

      await expect(
        client.saveDnsRecords("example.com", [{ type: "SRV", name: "_sip._tcp" }]),
      ).rejects.toThrow("SRV record must have");
    });

    it("builds ALIAS record from aliasName", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        { type: "ALIAS", name: "@", aliasName: "example.herokudns.com", ttl: 3600 },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.items[0].aliasName).toBe("example.herokudns.com");
      expect(body.items[0]).not.toHaveProperty("value");
    });

    it("builds CAA record from flag/tag/value", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        { type: "CAA", name: "@", flag: 0, tag: "issue", value: "letsencrypt.org", ttl: 3600 },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.items[0].flag).toBe(0);
      expect(body.items[0].tag).toBe("issue");
      expect(body.items[0].value).toBe("letsencrypt.org");
    });

    it("builds HTTPS record from structured fields", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        {
          type: "HTTPS",
          name: "@",
          svcPriority: 1,
          targetName: "cdn.example.com",
          svcParams: "alpn=h2,h3",
          ttl: 3600,
        },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.items[0].svcPriority).toBe(1);
      expect(body.items[0].targetName).toBe("cdn.example.com");
      expect(body.items[0].svcParams).toBe("alpn=h2,h3");
    });

    it("builds NS record from nameserver", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        { type: "NS", name: "sub", nameserver: "ns1.example.com", ttl: 3600 },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.items[0].nameserver).toBe("ns1.example.com");
    });

    it("builds PTR record from pointer", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        { type: "PTR", name: "4.3.2.1", pointer: "host.example.com", ttl: 3600 },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.items[0].pointer).toBe("host.example.com");
    });

    it("builds SVCB record from structured fields", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        {
          type: "SVCB",
          name: "@",
          svcPriority: 0,
          targetName: "svc.example.com",
          ttl: 3600,
        },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.items[0].svcPriority).toBe(0);
      expect(body.items[0].targetName).toBe("svc.example.com");
    });

    it("builds TLSA record from structured fields", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        {
          type: "TLSA",
          name: "_443._tcp",
          port: "_443",
          protocol: "_tcp",
          usage: 3,
          selector: 1,
          matching: 1,
          associationData: "abcdef",
          ttl: 3600,
        },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.items[0].port).toBe("_443");
      expect(body.items[0].protocol).toBe("_tcp");
      expect(body.items[0].usage).toBe(3);
      expect(body.items[0].selector).toBe(1);
      expect(body.items[0].matching).toBe(1);
      expect(body.items[0].associationData).toBe("abcdef");
    });

    it("builds TLSA record with scheme", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        {
          type: "TLSA",
          name: "_443._tcp",
          port: "_443",
          protocol: "_tcp",
          usage: 3,
          selector: 1,
          matching: 1,
          associationData: "abcdef",
          scheme: "_https",
        },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.items[0].scheme).toBe("_https");
    });

    it("builds MX record from priority field (not preference)", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        { type: "MX", name: "@", priority: 20, exchange: "mail2.example.com" },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.items[0].preference).toBe(20);
      expect(body.items[0].exchange).toBe("mail2.example.com");
    });

    it("builds SRV record from value string", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        { type: "SRV", name: "_sip._tcp", value: "10 60 5060 sip.example.com" },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.items[0].priority).toBe(10);
      expect(body.items[0].weight).toBe(60);
      expect(body.items[0].port).toBe(5060);
      expect(body.items[0].target).toBe("sip.example.com");
      expect(body.items[0].service).toBe("_sip");
      expect(body.items[0].protocol).toBe("_tcp");
    });

    it("throws for SRV value with invalid name format", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());

      await expect(
        client.saveDnsRecords("example.com", [
          { type: "SRV", name: "bad-name", value: "10 60 5060 sip.example.com" },
        ]),
      ).rejects.toThrow("Invalid SRV record name format");
    });

    it("throws for SRV value with too few parts", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());

      await expect(
        client.saveDnsRecords("example.com", [
          { type: "SRV", name: "_sip._tcp", value: "10 60" },
        ]),
      ).rejects.toThrow("Invalid SRV record format");
    });

    it("builds SRV record with non-SRV name (empty service/protocol)", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        {
          type: "SRV",
          name: "plain-name",
          priority: 10,
          weight: 60,
          port: 5060,
          target: "sip.example.com",
        },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.items[0].service).toBe("");
      expect(body.items[0].protocol).toBe("");
    });

    it("builds ALIAS record from value fallback", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        { type: "ALIAS", name: "@", value: "target.example.com" },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.items[0].aliasName).toBe("target.example.com");
    });

    it("builds CNAME record from value fallback", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        { type: "CNAME", name: "www", value: "example.com" },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.items[0].cname).toBe("example.com");
    });

    it("builds A record from value fallback", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        { type: "A", name: "@", value: "1.2.3.4" },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.items[0].address).toBe("1.2.3.4");
    });

    it("builds NS record from value fallback", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        { type: "NS", name: "sub", value: "ns1.example.com" },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.items[0].nameserver).toBe("ns1.example.com");
    });

    it("builds PTR record from value fallback", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        { type: "PTR", name: "4.3.2.1", value: "host.example.com" },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.items[0].pointer).toBe("host.example.com");
    });

    it("builds HTTPS record with port and scheme", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        {
          type: "HTTPS",
          name: "@",
          svcPriority: 1,
          targetName: "cdn.example.com",
          port: "_443",
          scheme: "_https",
        },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.items[0].port).toBe("_443");
      expect(body.items[0].scheme).toBe("_https");
    });

    it("builds unknown record type with value", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        { type: "CUSTOM", name: "@", value: "some-data" },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.items[0].type).toBe("CUSTOM");
      expect(body.items[0].value).toBe("some-data");
    });

    it("builds record without ttl when undefined", async () => {
      mockFetch.mockResolvedValueOnce(emptyList());
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await client.saveDnsRecords("example.com", [
        { type: "A", name: "@", address: "1.2.3.4" },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.items[0]).not.toHaveProperty("ttl");
    });
  });
});
