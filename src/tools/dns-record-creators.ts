import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { SpaceshipClient } from "../spaceship-client.js";
import type { DnsRecord } from "../types.js";
import { normalizeDomain } from "../dns-utils.js";
import { toTextResult, toErrorResult } from "../tool-result.js";
import { createRecordOutput } from "../output-schemas.js";

const handleCreateRecord = async (
  client: SpaceshipClient,
  domain: string,
  record: DnsRecord,
  formatSuccess: (normalizedDomain: string) => string,
): Promise<ReturnType<typeof toTextResult | typeof toErrorResult>> => {
  try {
    const normalizedDomain = normalizeDomain(domain);
    await client.saveDnsRecords(normalizedDomain, [record]);
    return toTextResult(formatSuccess(normalizedDomain));
  } catch (error) {
    return toErrorResult(error);
  }
};

export const registerDnsRecordCreatorTools = (server: McpServer, client: SpaceshipClient): void => {
  server.registerTool(
    "create_a_record",
    {
      title: "Create A Record",
      description:
        "Create an A record (IPv4 address) for a domain. " +
        "WARNING: This replaces ALL existing A records with the same name — previous A records for this name will be overwritten, not merged. " +
        "Use list_dns_records first to check for existing records.",
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name"),
        name: z.string().describe('Record name (subdomain, use "@" for root)'),
        address: z.string().ipv4().describe('IPv4 address (e.g. "192.0.2.1")'),
        ttl: z.number().int().min(60).max(86400).default(3600).describe("TTL in seconds"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      outputSchema: createRecordOutput,
    },
    async ({ domain, name, address, ttl }) =>
      handleCreateRecord(client, domain, { name, type: "A", address, ttl },
        (d) => `Successfully created A record: ${name}.${d} -> ${address}`),
  );

  server.registerTool(
    "create_aaaa_record",
    {
      title: "Create AAAA Record",
      description:
        "Create an AAAA record (IPv6 address) for a domain. " +
        "WARNING: This replaces ALL existing AAAA records with the same name — previous AAAA records for this name will be overwritten, not merged. " +
        "Use list_dns_records first to check for existing records.",
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name"),
        name: z.string().describe('Record name (subdomain, use "@" for root)'),
        address: z.string().ipv6().describe('IPv6 address (e.g. "2001:db8::1")'),
        ttl: z.number().int().min(60).max(86400).default(3600).describe("TTL in seconds"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      outputSchema: createRecordOutput,
    },
    async ({ domain, name, address, ttl }) =>
      handleCreateRecord(client, domain, { name, type: "AAAA", address, ttl },
        (d) => `Successfully created AAAA record: ${name}.${d} -> ${address}`),
  );

  server.registerTool(
    "create_cname_record",
    {
      title: "Create CNAME Record",
      description:
        "Create a CNAME record (canonical name/alias) for a domain. " +
        "WARNING: This replaces ALL existing CNAME records with the same name — previous CNAME records for this name will be overwritten, not merged. " +
        "Use list_dns_records first to check for existing records.",
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name"),
        name: z.string().describe("Record name (subdomain)"),
        cname: z.string().describe('Canonical name to point to (e.g. "example.com")'),
        ttl: z.number().int().min(60).max(86400).default(3600).describe("TTL in seconds"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      outputSchema: createRecordOutput,
    },
    async ({ domain, name, cname, ttl }) =>
      handleCreateRecord(client, domain, { name, type: "CNAME", cname, ttl },
        (d) => `Successfully created CNAME record: ${name}.${d} -> ${cname}`),
  );

  server.registerTool(
    "create_mx_record",
    {
      title: "Create MX Record",
      description:
        "Create an MX record (mail exchange) for a domain. " +
        "WARNING: This replaces ALL existing MX records with the same name — previous MX records for this name will be overwritten, not merged. " +
        "Overwriting MX records can disrupt email delivery. Use list_dns_records first to check for existing records.",
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name"),
        name: z.string().describe('Record name (subdomain, use "@" for root)'),
        priority: z.number().int().min(0).max(65535).describe("Priority (lower = higher priority)"),
        exchange: z.string().describe('Mail server hostname (e.g. "mail.example.com")'),
        ttl: z.number().int().min(60).max(86400).default(3600).describe("TTL in seconds"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      outputSchema: createRecordOutput,
    },
    async ({ domain, name, priority, exchange, ttl }) =>
      handleCreateRecord(client, domain, { name, type: "MX", preference: priority, exchange, ttl },
        (d) => `Successfully created MX record: ${name}.${d} -> ${exchange} (priority: ${priority})`),
  );

  server.registerTool(
    "create_srv_record",
    {
      title: "Create SRV Record",
      description:
        "Create an SRV record (service locator) for a domain. " +
        "WARNING: This replaces ALL existing SRV records with the same name — previous SRV records for this name will be overwritten, not merged. " +
        "Use list_dns_records first to check for existing records.",
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name"),
        name: z.string().describe('Service name (e.g. "_autodiscover._tcp")'),
        priority: z.number().int().min(0).max(65535).describe("Priority (lower = higher priority)"),
        weight: z.number().int().min(0).max(65535).describe("Weight for load balancing"),
        port: z.number().int().min(1).max(65535).describe("Port number"),
        target: z.string().describe('Target hostname (e.g. "autodiscover.example.com")'),
        ttl: z.number().int().min(60).max(86400).default(3600).describe("TTL in seconds"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      outputSchema: createRecordOutput,
    },
    async ({ domain, name, priority, weight, port, target, ttl }) =>
      handleCreateRecord(client, domain, { name, type: "SRV", priority, weight, port, target, ttl },
        (d) => `Successfully created SRV record: ${name}.${d} -> ${target}:${port} (priority: ${priority}, weight: ${weight})`),
  );

  server.registerTool(
    "create_txt_record",
    {
      title: "Create TXT Record",
      description:
        "Create a TXT record (text data) for a domain. Useful for SPF, DKIM, DMARC, verification, etc. " +
        "WARNING: This replaces ALL existing TXT records with the same name — previous TXT records for this name will be overwritten, not merged. " +
        "Overwriting TXT records can break email authentication (SPF/DKIM/DMARC) or domain verification. Use list_dns_records first to check for existing records.",
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name"),
        name: z.string().describe('Record name (subdomain, use "@" for root)'),
        value: z.string().describe('Text value (e.g. "v=spf1 include:example.com -all")'),
        ttl: z.number().int().min(60).max(86400).default(3600).describe("TTL in seconds"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      outputSchema: createRecordOutput,
    },
    async ({ domain, name, value, ttl }) =>
      handleCreateRecord(client, domain, { name, type: "TXT", value, ttl },
        (d) => `Successfully created TXT record for ${name}.${d}`),
  );

  server.registerTool(
    "create_alias_record",
    {
      title: "Create ALIAS Record",
      description:
        "Create an ALIAS record (CNAME flattening at zone apex) for a domain. " +
        "WARNING: This replaces ALL existing ALIAS records with the same name — previous ALIAS records for this name will be overwritten, not merged. " +
        "Use list_dns_records first to check for existing records.",
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name"),
        name: z.string().describe('Record name (use "@" for root)'),
        aliasName: z.string().describe('Alias target hostname (e.g. "example.herokudns.com")'),
        ttl: z.number().int().min(60).max(86400).default(3600).describe("TTL in seconds"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      outputSchema: createRecordOutput,
    },
    async ({ domain, name, aliasName, ttl }) =>
      handleCreateRecord(client, domain, { name, type: "ALIAS", aliasName, ttl },
        (d) => `Successfully created ALIAS record: ${name}.${d} -> ${aliasName}`),
  );

  server.registerTool(
    "create_caa_record",
    {
      title: "Create CAA Record",
      description:
        "Create a CAA record (Certificate Authority Authorization) for a domain. Controls which CAs can issue certificates. " +
        "WARNING: This replaces ALL existing CAA records with the same name — previous CAA records for this name will be overwritten, not merged. " +
        "Incorrect CAA records can prevent SSL/TLS certificate issuance. Use list_dns_records first to check for existing records.",
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name"),
        name: z.string().describe('Record name (use "@" for root)'),
        flag: z.number().int().min(0).max(255).describe("Flag (0 = non-critical, 128 = critical)"),
        tag: z.string().describe('Tag: "issue", "issuewild", or "iodef"'),
        value: z.string().describe('CA domain or reporting URL (e.g. "letsencrypt.org")'),
        ttl: z.number().int().min(60).max(86400).default(3600).describe("TTL in seconds"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      outputSchema: createRecordOutput,
    },
    async ({ domain, name, flag, tag, value, ttl }) =>
      handleCreateRecord(client, domain, { name, type: "CAA", flag, tag, value, ttl },
        (d) => `Successfully created CAA record: ${name}.${d} ${flag} ${tag} "${value}"`),
  );

  server.registerTool(
    "create_https_record",
    {
      title: "Create HTTPS Record",
      description:
        "Create an HTTPS record (SVCB-compatible for HTTPS) for a domain. Used for HTTPS service binding and ECH. " +
        "WARNING: This replaces ALL existing HTTPS records with the same name — previous HTTPS records for this name will be overwritten, not merged. " +
        "Use list_dns_records first to check for existing records.",
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name"),
        name: z.string().describe('Record name (use "@" for root)'),
        svcPriority: z.number().int().min(0).max(65535).describe("Service priority (0 = alias mode, 1+ = service mode)"),
        targetName: z.string().describe('Target name (e.g. "cdn.example.com", use "." for same name)'),
        svcParams: z.string().optional().describe('SvcParams string (e.g. "alpn=h2,h3")'),
        port: z.string().optional().describe('Port string (e.g. "_443")'),
        scheme: z.string().optional().describe('Scheme label (e.g. "_https")'),
        ttl: z.number().int().min(60).max(86400).default(3600).describe("TTL in seconds"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      outputSchema: createRecordOutput,
    },
    async ({ domain, name, svcPriority, targetName, svcParams, port, scheme, ttl }) =>
      handleCreateRecord(client, domain, { name, type: "HTTPS", svcPriority, targetName, svcParams, port, scheme, ttl },
        (d) => `Successfully created HTTPS record: ${name}.${d} ${svcPriority} ${targetName}`),
  );

  server.registerTool(
    "create_ns_record",
    {
      title: "Create NS Record",
      description:
        "Create an NS record (nameserver delegation) for a domain. " +
        "WARNING: This replaces ALL existing NS records with the same name — previous NS records for this name will be overwritten, not merged. " +
        "Incorrect NS records can break DNS resolution for delegated subdomains. Use list_dns_records first to check for existing records.",
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name"),
        name: z.string().describe("Record name (subdomain to delegate)"),
        nameserver: z.string().describe('Nameserver hostname (e.g. "ns1.example.com")'),
        ttl: z.number().int().min(60).max(86400).default(3600).describe("TTL in seconds"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      outputSchema: createRecordOutput,
    },
    async ({ domain, name, nameserver, ttl }) =>
      handleCreateRecord(client, domain, { name, type: "NS", nameserver, ttl },
        (d) => `Successfully created NS record: ${name}.${d} -> ${nameserver}`),
  );

  server.registerTool(
    "create_ptr_record",
    {
      title: "Create PTR Record",
      description:
        "Create a PTR record (reverse DNS pointer) for a domain. " +
        "WARNING: This replaces ALL existing PTR records with the same name — previous PTR records for this name will be overwritten, not merged. " +
        "Use list_dns_records first to check for existing records.",
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name"),
        name: z.string().describe("Record name"),
        pointer: z.string().describe('Pointer target hostname (e.g. "host.example.com")'),
        ttl: z.number().int().min(60).max(86400).default(3600).describe("TTL in seconds"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      outputSchema: createRecordOutput,
    },
    async ({ domain, name, pointer, ttl }) =>
      handleCreateRecord(client, domain, { name, type: "PTR", pointer, ttl },
        (d) => `Successfully created PTR record: ${name}.${d} -> ${pointer}`),
  );

  server.registerTool(
    "create_svcb_record",
    {
      title: "Create SVCB Record",
      description:
        "Create an SVCB record (general service binding) for a domain. " +
        "WARNING: This replaces ALL existing SVCB records with the same name — previous SVCB records for this name will be overwritten, not merged. " +
        "Use list_dns_records first to check for existing records.",
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name"),
        name: z.string().describe("Record name"),
        svcPriority: z.number().int().min(0).max(65535).describe("Service priority (0 = alias mode, 1+ = service mode)"),
        targetName: z.string().describe('Target name (e.g. "svc.example.com")'),
        svcParams: z.string().optional().describe("SvcParams string"),
        port: z.string().optional().describe('Port string (e.g. "_443")'),
        scheme: z.string().optional().describe('Scheme label (e.g. "_tcp")'),
        ttl: z.number().int().min(60).max(86400).default(3600).describe("TTL in seconds"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      outputSchema: createRecordOutput,
    },
    async ({ domain, name, svcPriority, targetName, svcParams, port, scheme, ttl }) =>
      handleCreateRecord(client, domain, { name, type: "SVCB", svcPriority, targetName, svcParams, port, scheme, ttl },
        (d) => `Successfully created SVCB record: ${name}.${d} ${svcPriority} ${targetName}`),
  );

  server.registerTool(
    "create_tlsa_record",
    {
      title: "Create TLSA Record",
      description:
        "Create a TLSA record (TLS certificate association / DANE) for a domain. " +
        "WARNING: This replaces ALL existing TLSA records with the same name — previous TLSA records for this name will be overwritten, not merged. " +
        "Incorrect TLSA records can break TLS certificate validation for DANE-enabled clients. Use list_dns_records first to check for existing records.",
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name"),
        name: z.string().describe("Record name"),
        port: z.string().describe('Port string (e.g. "_443")'),
        protocol: z.string().describe('Protocol label (e.g. "_tcp")'),
        usage: z.number().int().min(0).max(255).describe("Usage (0=CA, 1=EE-PKIX, 2=TA, 3=EE)"),
        selector: z.number().int().min(0).max(255).describe("Selector (0=full cert, 1=public key)"),
        matching: z.number().int().min(0).max(255).describe("Matching type (0=exact, 1=SHA-256, 2=SHA-512)"),
        associationData: z.string().describe("Certificate association data (hex string)"),
        scheme: z.string().optional().describe('Scheme label (e.g. "_tcp")'),
        ttl: z.number().int().min(60).max(86400).default(3600).describe("TTL in seconds"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      outputSchema: createRecordOutput,
    },
    async ({ domain, name, port, protocol, usage, selector, matching, associationData, scheme, ttl }) =>
      handleCreateRecord(client, domain, { name, type: "TLSA", port, protocol, usage, selector, matching, associationData, scheme, ttl },
        (d) => `Successfully created TLSA record: ${name}.${d} ${usage} ${selector} ${matching}`),
  );
};
