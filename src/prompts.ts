import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import type { SpaceshipClient } from "./spaceship-client.js";

const DNS_RECORD_TYPES = [
  "A", "AAAA", "CNAME", "MX", "TXT", "NS",
  "SRV", "CAA", "ALIAS", "HTTPS", "SVCB", "PTR", "TLSA",
];

const PRIVACY_LEVELS = ["high", "public"];

const NAMESERVER_PROVIDERS = ["basic", "custom"];

const EMAIL_PROVIDERS = ["google", "microsoft", "fastmail", "custom"];

export const domainCompleter = (client: SpaceshipClient) =>
  async (value: string): Promise<string[]> => {
    try {
      const domains = await client.listAllDomains();
      return domains
        .map((d) => d.name)
        .filter((name) => name.toLowerCase().startsWith(value.toLowerCase()));
    } catch {
      return [];
    }
  };

export const staticCompleter = (options: string[]) =>
  (value: string | undefined): string[] =>
    options.filter((o) => o.toLowerCase().startsWith((value ?? "").toLowerCase()));

export const registerPrompts = (server: McpServer, client: SpaceshipClient): void => {
  const completeDomain = domainCompleter(client);

  server.prompt(
    "setup-domain",
    "Guided workflow for registering and configuring a new domain",
    { domain: completable(z.string().describe("Domain name to register (e.g. example.com)"), completeDomain) },
    async ({ domain }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: [
            `Help me register and configure the domain "${domain}". Follow these steps:`,
            "",
            "1. Check if the domain is available using check_domain_availability",
            "2. If available, register it using register_domain (confirm pricing with me first)",
            "3. Set nameservers using update_nameservers (ask me which provider to use)",
            "4. Configure essential DNS records (ask me what services I need)",
            "5. Set privacy level to 'high' using set_privacy_level",
            "6. Enable auto-renew using set_auto_renew",
            "",
            "Wait for my confirmation at each step before proceeding.",
          ].join("\n"),
        },
      }],
    }),
  );

  server.prompt(
    "audit-domain",
    "Comprehensive domain health check — reviews status, DNS, privacy, and auto-renew",
    { domain: completable(z.string().describe("Domain name to audit (e.g. example.com)"), completeDomain) },
    async ({ domain }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: [
            `Perform a comprehensive health check on "${domain}". Check the following:`,
            "",
            "1. Get domain details using get_domain — check status, expiry date, auto-renew, and privacy",
            "2. List all DNS records using list_dns_records — review for completeness",
            "3. Check DNS alignment if I have expected records",
            "4. Review privacy settings — is WHOIS privacy enabled?",
            "5. Check auto-renew status — is the domain protected from accidental expiry?",
            "6. List nameservers — are they correctly configured?",
            "",
            "Summarize findings and flag any issues or recommendations.",
          ].join("\n"),
        },
      }],
    }),
  );

  server.prompt(
    "setup-email",
    "Configure DNS records for email providers (Google Workspace, Microsoft 365, Fastmail, custom)",
    {
      domain: completable(z.string().describe("Domain name to configure email for"), completeDomain),
      provider: completable(z.string().describe("Email provider: google, microsoft, fastmail, or custom"), staticCompleter(EMAIL_PROVIDERS)),
    },
    async ({ domain, provider }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: [
            `Set up email DNS records for "${domain}" using ${provider} as the email provider.`,
            "",
            "1. First, list existing DNS records to check for conflicts",
            "2. Create MX records for the email provider",
            "3. Create SPF TXT record (v=spf1 ...)",
            "4. Create DKIM TXT record if I provide the DKIM value",
            "5. Create DMARC TXT record (_dmarc) with a sensible default policy",
            "",
            provider === "google" ? "For Google Workspace, use MX records: aspmx.l.google.com (1), alt1.aspmx.l.google.com (5), alt2.aspmx.l.google.com (5), alt3.aspmx.l.google.com (10), alt4.aspmx.l.google.com (10). SPF: v=spf1 include:_spf.google.com ~all" :
            provider === "microsoft" ? "For Microsoft 365, I'll need the MX and verification records from the Microsoft admin portal. Ask me for these values." :
            provider === "fastmail" ? "For Fastmail, use MX records: in1-smtp.messagingengine.com (10), in2-smtp.messagingengine.com (20). SPF: v=spf1 include:spf.messagingengine.com ~all" :
            "For a custom provider, ask me for the MX records, SPF include, and DKIM values.",
            "",
            "Confirm each DNS change with me before applying.",
          ].join("\n"),
        },
      }],
    }),
  );

  server.prompt(
    "migrate-dns",
    "Step-by-step DNS migration guide — export, review, recreate, and verify",
    { domain: completable(z.string().describe("Domain name to migrate DNS for"), completeDomain) },
    async ({ domain }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: [
            `Help me migrate DNS records for "${domain}". Follow this process:`,
            "",
            "1. Export current DNS records using list_dns_records — show me all records",
            "2. Review the records with me and identify which ones to migrate",
            "3. I'll tell you the target setup — create the new records",
            "4. Verify the new configuration using check_dns_alignment",
            "",
            "Important: Do NOT delete old records until I confirm the new ones are working.",
          ].join("\n"),
        },
      }],
    }),
  );

  server.prompt(
    "list-for-sale",
    "Guided SellerHub listing workflow — create listing, set pricing, generate checkout link",
    { domain: completable(z.string().describe("Domain name to list for sale"), completeDomain) },
    async ({ domain }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: [
            `Help me list "${domain}" for sale on SellerHub. Follow these steps:`,
            "",
            "1. Create the marketplace listing using create_sellerhub_domain",
            "2. Ask me about pricing — buy-it-now price and minimum offer price",
            "3. Update the listing with pricing using update_sellerhub_domain",
            "4. Ask if I want a description or display name",
            "5. Generate a checkout link using create_checkout_link",
            "6. Get verification records if needed using get_verification_records",
            "",
            "Confirm each step with me before proceeding.",
          ].join("\n"),
        },
      }],
    }),
  );

  server.prompt(
    "dns-records",
    "List DNS records for a domain, optionally filtered by type",
    {
      domain: completable(z.string().describe("Domain name"), completeDomain),
      type: completable(z.string().optional().describe("DNS record type filter"), staticCompleter(DNS_RECORD_TYPES)),
    },
    async ({ domain, type }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: type
            ? `List all ${type} DNS records for "${domain}" using the list_dns_records tool.`
            : `List all DNS records for "${domain}" using the list_dns_records tool and organize them by type.`,
        },
      }],
    }),
  );

  server.prompt(
    "set-privacy",
    "Set privacy level for a domain",
    {
      domain: completable(z.string().describe("Domain name"), completeDomain),
      level: completable(z.string().describe("Privacy level: high or public"), staticCompleter(PRIVACY_LEVELS)),
    },
    async ({ domain, level }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Set the privacy level for "${domain}" to "${level}" using the set_privacy_level tool with userConsent set to true.`,
        },
      }],
    }),
  );

  server.prompt(
    "update-nameservers",
    "Update nameservers for a domain",
    {
      domain: completable(z.string().describe("Domain name"), completeDomain),
      provider: completable(z.string().describe("Nameserver provider: basic or custom"), staticCompleter(NAMESERVER_PROVIDERS)),
    },
    async ({ domain, provider }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: provider === "basic"
            ? `Reset the nameservers for "${domain}" back to the default Spaceship nameservers using the update_nameservers tool with provider "basic".`
            : `Update the nameservers for "${domain}" to custom nameservers. First ask the user which nameservers to use, then call the update_nameservers tool.`,
        },
      }],
    }),
  );
};
