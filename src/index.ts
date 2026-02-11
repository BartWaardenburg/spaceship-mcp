#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

type OrderBy = "type" | "-type" | "name" | "-name";

type DnsRecord = {
  type: string;
  name: string;
  ttl?: number;
  group?: string;
  address?: string;
  cname?: string;
  exchange?: string;
  preference?: number;
  value?: string;
  service?: string;
  protocol?: string;
  priority?: number;
  weight?: number;
  port?: number;
  target?: string;
  [key: string]: unknown;
};

type ListDnsRecordsResponse = {
  items: DnsRecord[];
  total: number;
};

class SpaceshipApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

class SpaceshipClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(apiKey: string, apiSecret: string, baseUrl = "https://spaceship.dev/api") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  async listDnsRecords(
    domain: string,
    options: {
      take: number;
      skip: number;
      orderBy?: OrderBy;
    },
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
    const pageSize = 500;
    const all: DnsRecord[] = [];
    let skip = 0;
    let total = Number.POSITIVE_INFINITY;

    while (skip < total) {
      const response = await this.listDnsRecords(domain, {
        take: pageSize,
        skip,
        ...(orderBy ? { orderBy } : {}),
      });

      all.push(...response.items);
      total = response.total;
      skip += response.items.length;

      if (response.items.length === 0) {
        break;
      }
    }

    return all;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set("X-API-Key", this.apiKey);
    headers.set("X-API-Secret", this.apiSecret);
    headers.set("content-type", "application/json");

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text().catch(() => "");

    if (!response.ok) {
      throw new SpaceshipApiError(
        `Spaceship API request failed with ${response.status} ${response.statusText}`,
        response.status,
        body,
      );
    }

    return body as T;
  }
}

const WebRecordTypeSchema = z.enum(["A", "AAAA", "CNAME", "MX", "TXT", "SRV"]);

const ExpectedRecordSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("A"),
    name: z.string().min(1).max(255),
    address: z.string().min(7).max(45),
    ttl: z.number().int().min(60).max(3600).optional(),
  }),
  z.object({
    type: z.literal("AAAA"),
    name: z.string().min(1).max(255),
    address: z.string().min(2).max(45),
    ttl: z.number().int().min(60).max(3600).optional(),
  }),
  z.object({
    type: z.literal("CNAME"),
    name: z.string().min(1).max(255),
    cname: z.string().min(1).max(255),
    ttl: z.number().int().min(60).max(3600).optional(),
  }),
  z.object({
    type: z.literal("MX"),
    name: z.string().min(1).max(255),
    exchange: z.string().min(1).max(255),
    preference: z.number().int().min(0).max(65535),
    ttl: z.number().int().min(60).max(3600).optional(),
  }),
  z.object({
    type: z.literal("TXT"),
    name: z.string().min(1).max(255),
    value: z.string().min(1).max(65535),
    ttl: z.number().int().min(60).max(3600).optional(),
  }),
  z.object({
    type: z.literal("SRV"),
    name: z.string().min(1).max(255),
    service: z.string().min(2).max(63),
    protocol: z.string().min(2).max(63),
    priority: z.number().int().min(0).max(65535),
    weight: z.number().int().min(0).max(65535),
    port: z.number().int().min(1).max(65535),
    target: z.string().min(1).max(255),
    ttl: z.number().int().min(60).max(3600).optional(),
  }),
]);

const KnownVercelIpv4 = new Set(["76.76.21.21"]);

function normalizeDomain(input: string): string {
  return input.trim().replace(/\.$/, "").toLowerCase();
}

function normalizeName(input: string): string {
  return input.trim().replace(/\.$/, "").toLowerCase();
}

function normalizeHost(input: string): string {
  return input.trim().replace(/\.$/, "").toLowerCase();
}

function recordComparableValue(record: DnsRecord): string {
  const type = record.type.toUpperCase();

  switch (type) {
    case "A":
    case "AAAA":
      return String(record.address ?? "").trim();
    case "CNAME":
      return normalizeHost(String(record.cname ?? ""));
    case "MX":
      return `${Number(record.preference ?? -1)}:${normalizeHost(String(record.exchange ?? ""))}`;
    case "TXT":
      return String(record.value ?? "");
    case "SRV":
      return [
        String(record.service ?? ""),
        String(record.protocol ?? ""),
        String(record.priority ?? ""),
        String(record.weight ?? ""),
        String(record.port ?? ""),
        normalizeHost(String(record.target ?? "")),
      ].join(":");
    default:
      return "";
  }
}

function recordFingerprint(record: DnsRecord, includeTtl: boolean): string {
  const type = record.type.toUpperCase();
  const name = normalizeName(record.name);
  const value = recordComparableValue(record);
  const ttl = includeTtl ? String(record.ttl ?? "") : "";

  return `${type}|${name}|${value}|${ttl}`;
}

function expectedToRecord(expected: z.infer<typeof ExpectedRecordSchema>): DnsRecord {
  const withOptionalTtl = <T extends object>(record: T, ttl?: number): T & { ttl?: number } =>
    ttl === undefined ? record : { ...record, ttl };

  switch (expected.type) {
    case "A":
    case "AAAA":
      return withOptionalTtl(
        {
          type: expected.type,
          name: expected.name,
          address: expected.address,
        },
        expected.ttl,
      );
    case "CNAME":
      return withOptionalTtl(
        {
          type: "CNAME",
          name: expected.name,
          cname: expected.cname,
        },
        expected.ttl,
      );
    case "MX":
      return withOptionalTtl(
        {
          type: "MX",
          name: expected.name,
          exchange: expected.exchange,
          preference: expected.preference,
        },
        expected.ttl,
      );
    case "TXT":
      return withOptionalTtl(
        {
          type: "TXT",
          name: expected.name,
          value: expected.value,
        },
        expected.ttl,
      );
    case "SRV":
      return withOptionalTtl(
        {
          type: "SRV",
          name: expected.name,
          service: expected.service,
          protocol: expected.protocol,
          priority: expected.priority,
          weight: expected.weight,
          port: expected.port,
          target: expected.target,
        },
        expected.ttl,
      );
    default:
      return expected satisfies never;
  }
}

function extractComparableFields(record: DnsRecord): Record<string, unknown> {
  const type = record.type.toUpperCase();

  const common = {
    type,
    name: record.name,
    ttl: record.ttl,
  };

  switch (type) {
    case "A":
    case "AAAA":
      return { ...common, address: record.address };
    case "CNAME":
      return { ...common, cname: record.cname };
    case "MX":
      return { ...common, exchange: record.exchange, preference: record.preference };
    case "TXT":
      return { ...common, value: record.value };
    case "SRV":
      return {
        ...common,
        service: record.service,
        protocol: record.protocol,
        priority: record.priority,
        weight: record.weight,
        port: record.port,
        target: record.target,
      };
    default:
      return { ...common };
  }
}

function isLikelyVercelRecord(record: DnsRecord): boolean {
  const type = record.type.toUpperCase();

  if (type === "A" && typeof record.address === "string") {
    if (KnownVercelIpv4.has(record.address)) {
      return true;
    }

    if (record.address.startsWith("216.198.79.")) {
      return true;
    }
  }

  const hostFields = [record.cname, record.exchange, record.target, record.value]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return hostFields.includes("vercel");
}

function summarizeByType(records: DnsRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const record of records) {
    const key = record.type.toUpperCase();
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return counts;
}

function toErrorResult(error: unknown) {
  if (error instanceof SpaceshipApiError) {
    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Spaceship API error: ${error.message}`,
            `Status: ${error.status}`,
            error.details ? `Details: ${JSON.stringify(error.details, null, 2)}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: error instanceof Error ? error.message : String(error),
      },
    ],
    isError: true,
  };
}

const apiKey = process.env.SPACESHIP_API_KEY;
const apiSecret = process.env.SPACESHIP_API_SECRET;

if (!apiKey || !apiSecret) {
  console.error("Missing required env vars: SPACESHIP_API_KEY and SPACESHIP_API_SECRET");
  process.exit(1);
}

const spaceship = new SpaceshipClient(apiKey, apiSecret);

const server = new McpServer({
  name: "spaceship-mcp-check",
  version: "0.1.0",
  websiteUrl: "https://docs.spaceship.dev/",
});

server.registerTool(
  "list_dns_records",
  {
    title: "List DNS Records",
    description:
      "Read DNS records from Spaceship for a domain. Uses required take/skip pagination and can fetch all pages.",
    inputSchema: z.object({
      domain: z.string().min(4).max(255).describe("Domain name, e.g. piggy.money"),
      fetchAll: z.boolean().default(true).describe("Fetch all pages (recommended)."),
      take: z
        .number()
        .int()
        .min(1)
        .max(500)
        .default(500)
        .describe("Items per page when fetchAll=false."),
      skip: z.number().int().min(0).default(0).describe("Offset when fetchAll=false."),
      orderBy: z.enum(["type", "-type", "name", "-name"]).optional(),
    }),
  },
  async ({ domain, fetchAll, take, skip, orderBy }) => {
    try {
      const normalizedDomain = normalizeDomain(domain);

      const records = fetchAll
        ? await spaceship.listAllDnsRecords(normalizedDomain, orderBy)
        : (
            await spaceship.listDnsRecords(normalizedDomain, {
              take,
              skip,
              ...(orderBy ? { orderBy } : {}),
            })
          ).items;

      const summary = summarizeByType(records);

      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Domain: ${normalizedDomain}`,
              `Records returned: ${records.length}`,
              `By type: ${JSON.stringify(summary)}`,
            ].join("\n"),
          },
        ],
        structuredContent: {
          domain: normalizedDomain,
          count: records.length,
          byType: summary,
          items: records.map(extractComparableFields),
        },
      };
    } catch (error) {
      return toErrorResult(error);
    }
  },
);

server.registerTool(
  "check_dns_alignment",
  {
    title: "Check DNS Alignment",
    description:
      "Compare expected DNS records to current Spaceship records. Returns missing and unexpected records for the selected types.",
    inputSchema: z.object({
      domain: z.string().min(4).max(255),
      expectedRecords: z.array(ExpectedRecordSchema).min(1),
      includeTtlInMatch: z.boolean().default(false),
      includeUnexpectedOfTypes: z
        .array(WebRecordTypeSchema)
        .default(["A", "AAAA", "CNAME", "MX", "TXT", "SRV"]),
    }),
  },
  async ({ domain, expectedRecords, includeTtlInMatch, includeUnexpectedOfTypes }) => {
    try {
      const normalizedDomain = normalizeDomain(domain);
      const actual = await spaceship.listAllDnsRecords(normalizedDomain);
      const actualFiltered = actual.filter((record) =>
        includeUnexpectedOfTypes.includes(
          record.type.toUpperCase() as z.infer<typeof WebRecordTypeSchema>,
        ),
      );

      const expectedAsRecords = expectedRecords.map(expectedToRecord);
      const actualByFingerprint = new Map<string, DnsRecord[]>();

      for (const record of actualFiltered) {
        const key = recordFingerprint(record, includeTtlInMatch);
        const records = actualByFingerprint.get(key) ?? [];
        records.push(record);
        actualByFingerprint.set(key, records);
      }

      const missing: DnsRecord[] = [];
      const matchedFingerprints = new Set<string>();

      for (const expected of expectedAsRecords) {
        const key = recordFingerprint(expected, includeTtlInMatch);
        const hasMatch = (actualByFingerprint.get(key)?.length ?? 0) > 0;

        if (hasMatch) {
          matchedFingerprints.add(key);
        } else {
          missing.push(expected);
        }
      }

      const unexpected = actualFiltered.filter(
        (record) => !matchedFingerprints.has(recordFingerprint(record, includeTtlInMatch)),
      );

      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Domain: ${normalizedDomain}`,
              `Expected records: ${expectedAsRecords.length}`,
              `Missing: ${missing.length}`,
              `Unexpected (${includeUnexpectedOfTypes.join(",")} only): ${unexpected.length}`,
            ].join("\n"),
          },
        ],
        structuredContent: {
          domain: normalizedDomain,
          includeTtlInMatch,
          missing: missing.map(extractComparableFields),
          unexpected: unexpected.map(extractComparableFields),
        },
      };
    } catch (error) {
      return toErrorResult(error);
    }
  },
);

server.registerTool(
  "analyze_fly_cutover",
  {
    title: "Analyze Fly Cutover",
    description:
      "Analyze current web DNS records for root/www and propose the exact upserts/deletes for a Vercel -> Fly cutover while preserving non-web records.",
    inputSchema: z.object({
      domain: z.string().min(4).max(255),
      flyApexA: z.string().optional().describe("Fly IPv4 for root @ record, e.g. 66.241.x.x"),
      flyApexAAAA: z.string().optional().describe("Fly IPv6 for root @ record"),
      flyWwwCname: z.string().optional().describe("Fly CNAME target for www, e.g. app.fly.dev"),
    }),
  },
  async ({ domain, flyApexA, flyApexAAAA, flyWwwCname }) => {
    try {
      const normalizedDomain = normalizeDomain(domain);
      const actual = await spaceship.listAllDnsRecords(normalizedDomain);

      const webTypes = new Set(["A", "AAAA", "CNAME", "ALIAS"]);
      const webRecords = actual.filter(
        (record) =>
          webTypes.has(record.type.toUpperCase()) &&
          ["@", "www"].includes(normalizeName(record.name)),
      );

      const desired: DnsRecord[] = [];

      if (flyApexA) {
        desired.push({ type: "A", name: "@", address: flyApexA.trim() });
      }

      if (flyApexAAAA) {
        desired.push({ type: "AAAA", name: "@", address: flyApexAAAA.trim() });
      }

      if (flyWwwCname) {
        desired.push({ type: "CNAME", name: "www", cname: normalizeHost(flyWwwCname) });
      }

      const desiredFingerprints = new Set(
        desired.map((record) => recordFingerprint(record, false)),
      );
      const actualFingerprints = new Set(
        webRecords.map((record) => recordFingerprint(record, false)),
      );

      const upserts = desired.filter(
        (record) => !actualFingerprints.has(recordFingerprint(record, false)),
      );
      const deletes = webRecords.filter(
        (record) => !desiredFingerprints.has(recordFingerprint(record, false)),
      );

      const likelyVercel = webRecords.some(isLikelyVercelRecord);

      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Domain: ${normalizedDomain}`,
              `Current root/www web records: ${webRecords.length}`,
              `Likely Vercel-managed web records detected: ${likelyVercel ? "yes" : "no"}`,
              `Proposed upserts: ${upserts.length}`,
              `Proposed deletes: ${deletes.length}`,
              "Note: this tool is read-only and does not modify DNS.",
            ].join("\n"),
          },
        ],
        structuredContent: {
          domain: normalizedDomain,
          likelyVercel,
          currentWebRecords: webRecords.map(extractComparableFields),
          proposedUpserts: upserts.map(extractComparableFields),
          proposedDeletes: deletes.map(extractComparableFields),
          preservedNonWebRecordCounts: summarizeByType(
            actual.filter(
              (record) =>
                !(
                  webTypes.has(record.type.toUpperCase()) &&
                  ["@", "www"].includes(normalizeName(record.name))
                ),
            ),
          ),
        },
      };
    } catch (error) {
      return toErrorResult(error);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Spaceship MCP server failed:", error);
  process.exit(1);
});
