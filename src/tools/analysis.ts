import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { SpaceshipClient } from "../spaceship-client.js";
import type { DnsRecord } from "../types.js";
import {
  normalizeDomain,
  recordFingerprint,
  extractComparableFields,
} from "../dns-utils.js";
import { WebRecordTypeSchema, ExpectedRecordSchema, expectedToRecord } from "../schemas.js";
import { toTextResult, toErrorResult } from "../tool-result.js";
import { checkDnsAlignmentOutput } from "../output-schemas.js";

export const registerAnalysisTools = (server: McpServer, client: SpaceshipClient): void => {
  server.registerTool(
    "check_dns_alignment",
    {
      title: "Check DNS Alignment",
      description:
        "Compare a list of expected DNS records against the actual records configured in Spaceship. Returns which expected records are missing and which unexpected records exist. Useful for verifying DNS configurations match your infrastructure requirements.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      outputSchema: checkDnsAlignmentOutput,
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
        const actual = await client.listAllDnsRecords(normalizedDomain);
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
          if ((actualByFingerprint.get(key)?.length ?? 0) > 0) {
            matchedFingerprints.add(key);
          } else {
            missing.push(expected);
          }
        }

        const unexpected = actualFiltered.filter(
          (record) => !matchedFingerprints.has(recordFingerprint(record, includeTtlInMatch)),
        );

        return toTextResult(
          [
            `Domain: ${normalizedDomain}`,
            `Expected records: ${expectedAsRecords.length}`,
            `Missing: ${missing.length}`,
            `Unexpected (${includeUnexpectedOfTypes.join(",")} only): ${unexpected.length}`,
          ].join("\n"),
          {
            domain: normalizedDomain,
            includeTtlInMatch,
            missing: missing.map(extractComparableFields),
            unexpected: unexpected.map(extractComparableFields),
          },
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );
};
