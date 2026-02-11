import { TtlCache } from "./cache.js";
import type {
  DnsRecord,
  DnsRecordToDelete,
  OrderBy,
  DomainOrderBy,
  ListDnsRecordsResponse,
  Domain,
  ListDomainsResponse,
  DomainAvailability,
  DomainAvailabilityRaw,
  Contact,
  SaveContactResponse,
  DomainContactIds,
  DomainRegistrationRequest,
  DomainRenewalRequest,
  DomainTransferRequest,
  TransferStatus,
  AuthCodeResponse,
  AsyncOperation,
  PersonalNameserver,
  PersonalNameserverResponse,
  SellerHubDomain,
  SellerHubPrice,
  ListSellerHubDomainsResponse,
  CreateSellerHubDomainRequest,
  CreateCheckoutLinkRequest,
  SellerHubCheckoutLink,
  SellerHubVerificationResponse,
} from "./types.js";

export class SpaceshipApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export class SpaceshipClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly cache: TtlCache;
  private readonly cachingEnabled: boolean;

  constructor(apiKey: string, apiSecret: string, baseUrl = "https://spaceship.dev/api", cacheTtlMs?: number) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.cachingEnabled = cacheTtlMs !== 0;
    this.cache = new TtlCache(cacheTtlMs ?? 120_000);
  }

  private async cachedRequest<T>(cacheKey: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
    if (!this.cachingEnabled || ttlMs <= 0) return fetcher();

    const cached = this.cache.get<T>(cacheKey);
    if (cached !== undefined) return cached;

    const result = await fetcher();
    this.cache.set(cacheKey, result, ttlMs);
    return result;
  }

  // --- DNS Records ---

  async listDnsRecords(
    domain: string,
    options: { take: number; skip: number; orderBy?: OrderBy },
  ): Promise<ListDnsRecordsResponse> {
    const query = new URLSearchParams({
      take: String(options.take),
      skip: String(options.skip),
    });

    if (options.orderBy) {
      query.set("orderBy", options.orderBy);
    }

    const path = `/v1/dns/records/${encodeURIComponent(domain)}?${query.toString()}`;
    return this.request<ListDnsRecordsResponse>(path);
  }

  async listAllDnsRecords(domain: string, orderBy?: OrderBy): Promise<DnsRecord[]> {
    return this.cachedRequest(
      `dns:${domain}:${orderBy ?? ""}`,
      120_000,
      () => this.paginate(
        500,
        (take, skip) => this.listDnsRecords(domain, { take, skip, ...(orderBy ? { orderBy } : {}) }),
      ),
    );
  }

  async saveDnsRecords(domain: string, records: DnsRecord[]): Promise<void> {
    const pairs = new Map<string, string>();
    for (const r of records) {
      pairs.set(`${r.name.toLowerCase()}|${r.type.toUpperCase()}`, r.type.toUpperCase());
    }

    const existing = await this.listAllDnsRecords(domain);
    const conflicting = existing.filter(
      (r) => pairs.has(`${r.name.toLowerCase()}|${r.type.toUpperCase()}`),
    );

    if (conflicting.length > 0) {
      const deletePayload = conflicting.map((record) => this.buildRecordPayload(record));
      await this.request(`/v1/dns/records/${encodeURIComponent(domain)}`, {
        method: "DELETE",
        body: JSON.stringify(deletePayload),
      });
    }

    const payload = {
      force: true,
      items: records.map((record) => this.buildRecordPayload(record)),
    };

    await this.request(`/v1/dns/records/${encodeURIComponent(domain)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    this.cache.invalidate(`dns:${domain}`);
  }

  async deleteDnsRecords(domain: string, records: DnsRecordToDelete[]): Promise<void> {
    const existing = await this.listAllDnsRecords(domain);

    const toDelete = records.flatMap((target) =>
      existing.filter(
        (r) =>
          r.name.toLowerCase() === target.name.toLowerCase() &&
          r.type.toUpperCase() === target.type.toUpperCase(),
      ),
    );

    if (toDelete.length === 0) {
      return;
    }

    const payload = toDelete.map((record) => this.buildRecordPayload(record));

    await this.request(`/v1/dns/records/${encodeURIComponent(domain)}`, {
      method: "DELETE",
      body: JSON.stringify(payload),
    });
    this.cache.invalidate(`dns:${domain}`);
  }

  // --- Domains ---

  async listDomains(options: {
    take: number;
    skip: number;
    orderBy?: DomainOrderBy;
  }): Promise<ListDomainsResponse> {
    const query = new URLSearchParams({
      take: String(options.take),
      skip: String(options.skip),
    });

    if (options.orderBy) {
      query.set("orderBy", options.orderBy);
    }

    return this.request<ListDomainsResponse>(`/v1/domains?${query.toString()}`);
  }

  async listAllDomains(orderBy?: DomainOrderBy): Promise<Domain[]> {
    return this.cachedRequest(
      `domains:all:${orderBy ?? ""}`,
      300_000,
      () => this.paginate(
        100,
        (take, skip) => this.listDomains({ take, skip, ...(orderBy ? { orderBy } : {}) }),
      ),
    );
  }

  async getDomain(domain: string): Promise<Domain> {
    return this.cachedRequest(
      `domain:${domain}`,
      120_000,
      () => this.request<Domain>(`/v1/domains/${encodeURIComponent(domain)}`),
    );
  }

  async deleteDomain(domain: string): Promise<void> {
    await this.request(
      `/v1/domains/${encodeURIComponent(domain)}`,
      { method: "DELETE" },
    );
  }

  async checkDomainAvailability(domain: string): Promise<DomainAvailability> {
    const raw = await this.request<DomainAvailabilityRaw>(
      `/v1/domains/${encodeURIComponent(domain)}/available`,
    );
    return this.toAvailability(raw);
  }

  async checkDomainsAvailability(domains: string[]): Promise<DomainAvailability[]> {
    const response = await this.request<{ domains: DomainAvailabilityRaw[] }>(
      "/v1/domains/available",
      {
        method: "POST",
        body: JSON.stringify({ domains }),
      },
    );
    return response.domains.map((raw) => this.toAvailability(raw));
  }

  private toAvailability(raw: DomainAvailabilityRaw): DomainAvailability {
    return {
      ...raw,
      available: raw.result === "available",
    };
  }

  async updateNameservers(
    domain: string,
    nameservers: string[],
    provider: "basic" | "custom" = "custom",
  ): Promise<void> {
    const payload: Record<string, unknown> = { provider };
    if (provider === "custom") {
      payload.hosts = nameservers;
    }

    await this.request(`/v1/domains/${encodeURIComponent(domain)}/nameservers`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  async setAutoRenew(domain: string, enabled: boolean): Promise<void> {
    await this.request(`/v1/domains/${encodeURIComponent(domain)}/autorenew`, {
      method: "PUT",
      body: JSON.stringify({ isEnabled: enabled }),
    });
    this.cache.invalidate(`domain:${domain}`);
  }

  async setTransferLock(domain: string, locked: boolean): Promise<void> {
    await this.request(`/v1/domains/${encodeURIComponent(domain)}/transfer/lock`, {
      method: "PUT",
      body: JSON.stringify({ isLocked: locked }),
    });
  }

  async getAuthCode(domain: string): Promise<AuthCodeResponse> {
    return this.request<AuthCodeResponse>(
      `/v1/domains/${encodeURIComponent(domain)}/transfer/auth-code`,
    );
  }

  // --- Domain Lifecycle ---

  async registerDomain(
    domain: string,
    options: DomainRegistrationRequest,
  ): Promise<{ operationId: string }> {
    return this.requestWithAsyncHeader(
      `/v1/domains/${encodeURIComponent(domain)}`,
      {
        method: "POST",
        body: JSON.stringify(options),
      },
    );
  }

  async renewDomain(
    domain: string,
    options: DomainRenewalRequest,
  ): Promise<{ operationId: string }> {
    return this.requestWithAsyncHeader(
      `/v1/domains/${encodeURIComponent(domain)}/renew`,
      {
        method: "POST",
        body: JSON.stringify(options),
      },
    );
  }

  async restoreDomain(domain: string): Promise<{ operationId: string }> {
    return this.requestWithAsyncHeader(
      `/v1/domains/${encodeURIComponent(domain)}/restore`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );
  }

  async transferDomain(
    domain: string,
    options: DomainTransferRequest,
  ): Promise<{ operationId: string }> {
    return this.requestWithAsyncHeader(
      `/v1/domains/${encodeURIComponent(domain)}/transfer`,
      {
        method: "POST",
        body: JSON.stringify(options),
      },
    );
  }

  async getTransferStatus(domain: string): Promise<TransferStatus> {
    return this.request<TransferStatus>(
      `/v1/domains/${encodeURIComponent(domain)}/transfer`,
    );
  }

  // --- Privacy ---

  async setPrivacyLevel(domain: string, level: "high" | "public", userConsent: boolean): Promise<void> {
    await this.request(
      `/v1/domains/${encodeURIComponent(domain)}/privacy/preference`,
      {
        method: "PUT",
        body: JSON.stringify({ privacyLevel: level, userConsent }),
      },
    );
    this.cache.invalidate(`domain:${domain}`);
  }

  async setEmailProtection(domain: string, contactForm: boolean): Promise<void> {
    await this.request(
      `/v1/domains/${encodeURIComponent(domain)}/privacy/email-protection-preference`,
      {
        method: "PUT",
        body: JSON.stringify({ contactForm }),
      },
    );
  }

  // --- Domain Contacts ---

  async updateDomainContacts(domain: string, contacts: DomainContactIds): Promise<{ verificationStatus: string | null }> {
    const result = await this.request<{ verificationStatus?: string }>(
      `/v1/domains/${encodeURIComponent(domain)}/contacts`,
      {
        method: "PUT",
        body: JSON.stringify(contacts),
      },
    );
    return { verificationStatus: result?.verificationStatus ?? null };
  }

  // --- Contacts ---

  async saveContact(contact: Contact): Promise<SaveContactResponse> {
    const result = await this.request<SaveContactResponse>("/v1/contacts", {
      method: "PUT",
      body: JSON.stringify(contact),
    });
    this.cache.invalidate("contact:");
    return result;
  }

  async getContact(contactId: string): Promise<Contact> {
    return this.cachedRequest(
      `contact:${contactId}`,
      300_000,
      () => this.request<Contact>(`/v1/contacts/${encodeURIComponent(contactId)}`),
    );
  }

  async saveContactAttributes(attributes: Record<string, string>): Promise<{ contactId: string }> {
    return this.request<{ contactId: string }>("/v1/contacts/attributes", {
      method: "PUT",
      body: JSON.stringify(attributes),
    });
  }

  async getContactAttributes(contactId: string): Promise<Record<string, string>> {
    return this.request<Record<string, string>>(
      `/v1/contacts/attributes/${encodeURIComponent(contactId)}`,
    );
  }

  // --- Async Operations ---

  async getAsyncOperation(operationId: string): Promise<AsyncOperation> {
    return this.request<AsyncOperation>(
      `/v1/async-operations/${encodeURIComponent(operationId)}`,
    );
  }

  // --- Personal Nameservers ---

  async listPersonalNameservers(domain: string): Promise<PersonalNameserver[]> {
    const response = await this.request<PersonalNameserverResponse>(
      `/v1/domains/${encodeURIComponent(domain)}/personal-nameservers`,
    );
    return response.records;
  }

  async getPersonalNameserver(domain: string, host: string): Promise<PersonalNameserver> {
    return this.request<PersonalNameserver>(
      `/v1/domains/${encodeURIComponent(domain)}/personal-nameservers/${encodeURIComponent(host)}`,
    );
  }

  async updatePersonalNameserver(
    domain: string,
    host: string,
    ips: string[],
  ): Promise<void> {
    await this.request(
      `/v1/domains/${encodeURIComponent(domain)}/personal-nameservers/${encodeURIComponent(host)}`,
      {
        method: "PUT",
        body: JSON.stringify({ host, ips }),
      },
    );
  }

  async deletePersonalNameserver(domain: string, host: string): Promise<void> {
    await this.request(
      `/v1/domains/${encodeURIComponent(domain)}/personal-nameservers/${encodeURIComponent(host)}`,
      {
        method: "DELETE",
      },
    );
  }

  // --- SellerHub ---

  async listSellerHubDomains(options: {
    take: number;
    skip: number;
  }): Promise<ListSellerHubDomainsResponse> {
    const query = new URLSearchParams({
      take: String(options.take),
      skip: String(options.skip),
    });

    return this.request<ListSellerHubDomainsResponse>(
      `/v1/sellerhub/domains?${query.toString()}`,
    );
  }

  async listAllSellerHubDomains(): Promise<SellerHubDomain[]> {
    return this.cachedRequest(
      "sellerhub:all",
      120_000,
      () => this.paginate(100, (take, skip) => this.listSellerHubDomains({ take, skip })),
    );
  }

  async createSellerHubDomain(data: CreateSellerHubDomainRequest): Promise<SellerHubDomain> {
    return this.request<SellerHubDomain>("/v1/sellerhub/domains", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getSellerHubDomain(name: string): Promise<SellerHubDomain> {
    return this.request<SellerHubDomain>(
      `/v1/sellerhub/domains/${encodeURIComponent(name)}`,
    );
  }

  async updateSellerHubDomain(
    name: string,
    data: {
      displayName?: string;
      description?: string;
      binPriceEnabled?: boolean;
      binPrice?: SellerHubPrice;
      minPriceEnabled?: boolean;
      minPrice?: SellerHubPrice;
    },
  ): Promise<SellerHubDomain> {
    return this.request<SellerHubDomain>(
      `/v1/sellerhub/domains/${encodeURIComponent(name)}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      },
    );
  }

  async deleteSellerHubDomain(name: string): Promise<void> {
    await this.request(
      `/v1/sellerhub/domains/${encodeURIComponent(name)}`,
      { method: "DELETE" },
    );
  }

  async createCheckoutLink(data: CreateCheckoutLinkRequest): Promise<SellerHubCheckoutLink> {
    return this.request<SellerHubCheckoutLink>("/v1/sellerhub/checkout-links", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getVerificationRecords(): Promise<SellerHubVerificationResponse> {
    return this.request<SellerHubVerificationResponse>(
      "/v1/sellerhub/verification-records",
    );
  }

  // --- Private ---

  private buildRecordPayload(record: DnsRecord): Record<string, unknown> {
    const item: Record<string, unknown> = {
      name: record.name,
      type: record.type,
      ...(record.ttl !== undefined ? { ttl: record.ttl } : {}),
    };

    switch (record.type.toUpperCase()) {
      case "MX":
        if (record.preference !== undefined && record.exchange) {
          item.preference = record.preference;
          item.exchange = record.exchange;
        } else if (record.priority !== undefined && record.exchange) {
          item.preference = record.priority;
          item.exchange = record.exchange;
        } else if (record.value) {
          const parts = record.value.trim().split(/\s+/);
          if (parts.length >= 2) {
            item.preference = parseInt(parts[0], 10);
            item.exchange = parts.slice(1).join(" ");
          } else {
            throw new Error(
              `Invalid MX record format. Expected "priority exchange" but got: ${record.value}`,
            );
          }
        } else {
          throw new Error("MX record must have preference/exchange or value field");
        }
        break;

      case "SRV":
        if (
          record.priority !== undefined &&
          record.weight !== undefined &&
          record.port !== undefined &&
          record.target
        ) {
          item.priority = record.priority;
          item.weight = record.weight;
          item.port = record.port;
          item.target = record.target;

          const nameParts = record.name.split(".");
          if (nameParts.length >= 2 && nameParts[0].startsWith("_") && nameParts[1].startsWith("_")) {
            item.service = record.service ?? nameParts[0];
            item.protocol = record.protocol ?? nameParts[1];
          } else {
            item.service = record.service ?? "";
            item.protocol = record.protocol ?? "";
          }
        } else if (record.value) {
          const parts = record.value.trim().split(/\s+/);
          if (parts.length >= 4) {
            item.priority = parseInt(parts[0], 10);
            item.weight = parseInt(parts[1], 10);
            item.port = parseInt(parts[2], 10);
            item.target = parts[3];

            const nameParts = record.name.split(".");
            if (nameParts.length >= 2 && nameParts[0].startsWith("_") && nameParts[1].startsWith("_")) {
              item.service = nameParts[0];
              item.protocol = nameParts[1];
            } else {
              throw new Error(
                `Invalid SRV record name format. Expected _service._protocol but got: ${record.name}`,
              );
            }
          } else {
            throw new Error(
              `Invalid SRV record format. Expected "priority weight port target" but got: ${record.value}`,
            );
          }
        } else {
          throw new Error("SRV record must have priority/weight/port/target or value field");
        }
        break;

      case "ALIAS":
        item.aliasName = record.aliasName ?? record.value;
        break;

      case "CAA":
        item.flag = record.flag;
        item.tag = record.tag;
        item.value = record.value;
        break;

      case "CNAME":
        item.cname = record.cname ?? record.value;
        break;

      case "HTTPS":
      case "SVCB":
        item.svcPriority = record.svcPriority;
        item.targetName = record.targetName;
        if (record.svcParams !== undefined) item.svcParams = record.svcParams;
        if (record.port !== undefined) item.port = record.port;
        if (record.scheme !== undefined) item.scheme = record.scheme;
        break;

      case "A":
      case "AAAA":
        item.address = record.address ?? record.value;
        break;

      case "NS":
        item.nameserver = record.nameserver ?? record.value;
        break;

      case "PTR":
        item.pointer = record.pointer ?? record.value;
        break;

      case "TLSA":
        item.port = record.port;
        item.protocol = record.protocol;
        item.usage = record.usage;
        item.selector = record.selector;
        item.matching = record.matching;
        item.associationData = record.associationData;
        if (record.scheme !== undefined) item.scheme = record.scheme;
        break;

      default:
        item.value = record.value;
        break;
    }

    return item;
  }

  private async paginate<T>(
    pageSize: number,
    fetcher: (take: number, skip: number) => Promise<{ items: T[]; total: number }>,
  ): Promise<T[]> {
    const all: T[] = [];
    let skip = 0;
    let total = Number.POSITIVE_INFINITY;

    while (skip < total) {
      const response = await fetcher(pageSize, skip);
      all.push(...response.items);
      total = response.total;
      skip += response.items.length;

      if (response.items.length === 0) {
        break;
      }
    }

    return all;
  }

  private static async parseBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") ?? "";
    return contentType.includes("application/json")
      ? response.json().catch(() => null)
      : response.text().catch(() => "");
  }

  private async rawRequest(path: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.set("X-API-Key", this.apiKey);
    headers.set("X-API-Secret", this.apiSecret);
    headers.set("Content-Type", "application/json");

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (response.ok || response.status === 204 || response.status === 202) {
      return response;
    }

    throw new SpaceshipApiError(
      `Spaceship API request failed: ${response.status} ${response.statusText}`,
      response.status,
      await SpaceshipClient.parseBody(response),
    );
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.rawRequest(path, init);

    if (response.status === 204) {
      return null as T;
    }

    return await SpaceshipClient.parseBody(response) as T;
  }

  private async requestWithAsyncHeader(
    path: string,
    init: RequestInit,
  ): Promise<{ operationId: string }> {
    const response = await this.rawRequest(path, init);
    const operationId = response.headers.get("spaceship-async-operationid") ?? "";
    return { operationId };
  }
}
