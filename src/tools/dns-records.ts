import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { SpaceshipClient } from "../spaceship-client.js";
import type { DnsRecord } from "../types.js";
import { normalizeDomain, summarizeByType, extractComparableFields } from "../dns-utils.js";
import { toTextResult, toErrorResult } from "../tool-result.js";
import { listDnsRecordsOutput, saveDnsRecordsOutput, deleteDnsRecordsOutput } from "../output-schemas.js";

export const registerDnsRecordTools = (server: McpServer, client: SpaceshipClient): void => {
  server.registerTool(
    "list_dns_records",
    {
      title: "List DNS Records",
      description:
        "List all DNS records for a domain. Uses pagination and can fetch all pages automatically.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      outputSchema: listDnsRecordsOutput,
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("Domain name, e.g. example.com"),
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
          ? await client.listAllDnsRecords(normalizedDomain, orderBy)
          : (
              await client.listDnsRecords(normalizedDomain, {
                take,
                skip,
                ...(orderBy ? { orderBy } : {}),
              })
            ).items;

        const summary = summarizeByType(records);

        return toTextResult(
          [
            `Domain: ${normalizedDomain}`,
            `Records returned: ${records.length}`,
            `By type: ${JSON.stringify(summary)}`,
          ].join("\n"),
          {
            domain: normalizedDomain,
            count: records.length,
            byType: summary,
            items: records.map(extractComparableFields),
          },
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "save_dns_records",
    {
      title: "Save DNS Records",
      description:
        "Save (upsert) DNS records for a domain using PUT with force overwrite. " +
        "WARNING: All existing records matching the same name AND type combination will be completely replaced — not merged. Other record name/type combinations are preserved. " +
        "Use this for bulk operations with mixed record types. For single records, prefer the type-specific tools (create_a_record, create_cname_record, etc.). " +
        "Always confirm with the user before calling this tool and use list_dns_records first to check existing records.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      outputSchema: saveDnsRecordsOutput,
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name"),
        records: z
          .array(
            z.object({
              name: z.string().describe("Record name (subdomain, use @ for root)"),
              type: z.string().describe("Record type (A, AAAA, ALIAS, CAA, CNAME, HTTPS, MX, NS, PTR, SRV, SVCB, TLSA, TXT)"),
              ttl: z.number().int().min(60).max(86400).default(3600).describe("TTL in seconds"),
              value: z.string().optional().describe("Generic value (TXT, CAA value, or fallback)"),
              address: z.string().optional().describe("IPv4/IPv6 address (A, AAAA)"),
              aliasName: z.string().optional().describe("Alias target (ALIAS)"),
              flag: z.number().int().optional().describe("Flag 0 or 128 (CAA)"),
              tag: z.string().optional().describe('Tag e.g. "issue", "issuewild", "iodef" (CAA)'),
              cname: z.string().optional().describe("Canonical name (CNAME)"),
              svcPriority: z.number().int().optional().describe("Service priority 0-65535 (HTTPS, SVCB)"),
              targetName: z.string().optional().describe("Target name (HTTPS, SVCB)"),
              svcParams: z.string().optional().describe("SvcParams string (HTTPS, SVCB)"),
              exchange: z.string().optional().describe("Mail server hostname (MX)"),
              preference: z.number().int().optional().describe("MX preference 0-65535"),
              nameserver: z.string().optional().describe("Nameserver hostname (NS)"),
              pointer: z.string().optional().describe("Pointer target (PTR)"),
              service: z.string().optional().describe("Service label e.g. _sip (SRV)"),
              protocol: z.string().optional().describe("Protocol label e.g. _tcp (SRV, TLSA)"),
              priority: z.number().int().optional().describe("Priority 0-65535 (SRV)"),
              weight: z.number().int().optional().describe("Weight 0-65535 (SRV)"),
              port: z.union([z.number().int(), z.string()]).optional().describe("Port number (SRV) or port string like _443 (HTTPS, SVCB, TLSA)"),
              target: z.string().optional().describe("Target hostname (SRV)"),
              scheme: z.string().optional().describe("Scheme e.g. _https, _tcp (HTTPS, SVCB, TLSA)"),
              usage: z.number().int().optional().describe("Usage 0-255 (TLSA)"),
              selector: z.number().int().optional().describe("Selector 0-255 (TLSA)"),
              matching: z.number().int().optional().describe("Matching type 0-255 (TLSA)"),
              associationData: z.string().optional().describe("Certificate association hex data (TLSA)"),
            }),
          )
          .min(1),
      }),
    },
    async ({ domain, records }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        const dnsRecords: DnsRecord[] = records.map((r) => {
          const record: DnsRecord = { name: r.name, type: r.type, ttl: r.ttl };
          if (r.value !== undefined) record.value = r.value;
          if (r.address !== undefined) record.address = r.address;
          if (r.aliasName !== undefined) record.aliasName = r.aliasName;
          if (r.flag !== undefined) record.flag = r.flag;
          if (r.tag !== undefined) record.tag = r.tag;
          if (r.cname !== undefined) record.cname = r.cname;
          if (r.svcPriority !== undefined) record.svcPriority = r.svcPriority;
          if (r.targetName !== undefined) record.targetName = r.targetName;
          if (r.svcParams !== undefined) record.svcParams = r.svcParams;
          if (r.exchange !== undefined) record.exchange = r.exchange;
          if (r.preference !== undefined) record.preference = r.preference;
          if (r.nameserver !== undefined) record.nameserver = r.nameserver;
          if (r.pointer !== undefined) record.pointer = r.pointer;
          if (r.service !== undefined) record.service = r.service;
          if (r.protocol !== undefined) record.protocol = r.protocol;
          if (r.priority !== undefined) record.priority = r.priority;
          if (r.weight !== undefined) record.weight = r.weight;
          if (r.port !== undefined) record.port = r.port;
          if (r.target !== undefined) record.target = r.target;
          if (r.scheme !== undefined) record.scheme = r.scheme;
          if (r.usage !== undefined) record.usage = r.usage;
          if (r.selector !== undefined) record.selector = r.selector;
          if (r.matching !== undefined) record.matching = r.matching;
          if (r.associationData !== undefined) record.associationData = r.associationData;
          return record;
        });

        await client.saveDnsRecords(normalizedDomain, dnsRecords);

        return toTextResult(
          `Successfully created ${records.length} DNS record(s) for ${normalizedDomain}`,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "delete_dns_records",
    {
      title: "Delete DNS Records",
      description:
        "Delete specific DNS records from a domain by name and type. Only records matching both the name AND type will be removed. Other records are not affected. " +
        "WARNING: This permanently removes DNS records, which can break services relying on them. " +
        "Always confirm with the user before calling this tool and use list_dns_records first to verify which records will be deleted.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      outputSchema: deleteDnsRecordsOutput,
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name"),
        records: z
          .array(
            z.object({
              name: z.string().describe("Record name (subdomain)"),
              type: z.string().describe("Record type (A, AAAA, CNAME, MX, TXT, SRV, etc.)"),
            }),
          )
          .min(1),
      }),
    },
    async ({ domain, records }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        await client.deleteDnsRecords(normalizedDomain, records);

        return toTextResult(
          `Successfully deleted ${records.length} DNS record(s) from ${normalizedDomain}`,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );
};
