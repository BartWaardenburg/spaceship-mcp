import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { SpaceshipClient } from "../spaceship-client.js";
import { normalizeDomain } from "../dns-utils.js";
import { toTextResult, toErrorResult } from "../tool-result.js";
import {
  listSellerHubDomainsOutput, createSellerHubDomainOutput, getSellerHubDomainOutput,
  updateSellerHubDomainOutput, deleteSellerHubDomainOutput,
  createCheckoutLinkOutput, getVerificationRecordsOutput,
} from "../output-schemas.js";

const formatPrice = (price?: { amount: string; currency: string }): string =>
  price ? `${price.currency} ${price.amount}` : "not set";

const formatDomain = (d: { name: string; status?: string; binPrice?: { amount: string; currency: string }; minPrice?: { amount: string; currency: string } }): string =>
  `${d.name}${d.status ? ` [${d.status}]` : ""}${d.binPrice ? ` BIN: ${formatPrice(d.binPrice)}` : ""}${d.minPrice ? ` min: ${formatPrice(d.minPrice)}` : ""}`;

const SellerHubPriceSchema = z.object({
  amount: z.string().describe('Price amount as a string (e.g. "9999")'),
  currency: z.string().describe('Currency code (e.g. "USD")'),
});

export const registerSellerHubTools = (server: McpServer, client: SpaceshipClient): void => {
  server.registerTool(
    "list_sellerhub_domains",
    {
      title: "List SellerHub Domains",
      description:
        "List domains listed for sale on SellerHub, Spaceship's domain marketplace for selling domains.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      outputSchema: listSellerHubDomainsOutput,
      inputSchema: z.object({
        fetchAll: z.boolean().default(true).describe("Fetch all pages (recommended)."),
        take: z.number().int().min(1).max(100).default(100).describe("Items per page when fetchAll=false."),
        skip: z.number().int().min(0).default(0).describe("Offset when fetchAll=false."),
      }),
    },
    async ({ fetchAll, take, skip }) => {
      try {
        if (fetchAll) {
          const domains = await client.listAllSellerHubDomains();
          return toTextResult(
            [
              `Total SellerHub domains: ${domains.length}`,
              ...domains.map((d) => `  - ${formatDomain(d)}`),
            ].join("\n"),
            { count: domains.length, domains },
          );
        }

        const response = await client.listSellerHubDomains({ take, skip });
        return toTextResult(
          [
            `Total: ${response.total}, showing ${response.items.length} (skip: ${skip})`,
            ...response.items.map((d) => `  - ${formatDomain(d)}`),
          ].join("\n"),
          { total: response.total, items: response.items } as Record<string, unknown>,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "create_sellerhub_domain",
    {
      title: "Create SellerHub Listing",
      description:
        "List a domain for sale on the SellerHub marketplace. " +
        "This makes the domain publicly visible as available for purchase. The domain starts in 'verifying' status. " +
        "You can optionally set pricing at creation time, or use update_sellerhub_domain later. " +
        "Always confirm with the user before listing — verify the domain name.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      outputSchema: createSellerHubDomainOutput,
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name to list for sale."),
        displayName: z.string().optional().describe("Display name for the listing."),
        description: z.string().optional().describe("Description for the listing."),
        binPriceEnabled: z.boolean().optional().describe("Enable the buy-it-now price."),
        binPrice: SellerHubPriceSchema.optional().describe('Buy-it-now price (e.g. { amount: "9999", currency: "USD" }).'),
        minPriceEnabled: z.boolean().optional().describe("Enable the minimum offer price."),
        minPrice: SellerHubPriceSchema.optional().describe('Minimum offer price (e.g. { amount: "100", currency: "USD" }).'),
      }),
    },
    async ({ domain, displayName, description, binPriceEnabled, binPrice, minPriceEnabled, minPrice }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        const result = await client.createSellerHubDomain({
          name: normalizedDomain,
          ...(displayName !== undefined ? { displayName } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(binPriceEnabled !== undefined ? { binPriceEnabled } : {}),
          ...(binPrice !== undefined ? { binPrice } : {}),
          ...(minPriceEnabled !== undefined ? { minPriceEnabled } : {}),
          ...(minPrice !== undefined ? { minPrice } : {}),
        });
        const hasPricing = binPrice !== undefined || minPrice !== undefined;
        return toTextResult(
          `Listed ${result.name} on SellerHub [${result.status ?? "pending"}].${hasPricing ? "" : " Use update_sellerhub_domain to set pricing."}`,
          result as Record<string, unknown>,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "get_sellerhub_domain",
    {
      title: "Get SellerHub Domain",
      description: "Get details of a SellerHub listing by domain name.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      outputSchema: getSellerHubDomainOutput,
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name of the SellerHub listing."),
      }),
    },
    async ({ domain }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        const result = await client.getSellerHubDomain(normalizedDomain);
        return toTextResult(
          [
            `Domain: ${result.name}`,
            result.displayName ? `Display name: ${result.displayName}` : null,
            result.status ? `Status: ${result.status}` : null,
            result.description ? `Description: ${result.description}` : null,
            `BIN price: ${formatPrice(result.binPrice)} (${result.binPriceEnabled ? "enabled" : "disabled"})`,
            `Min price: ${formatPrice(result.minPrice)} (${result.minPriceEnabled ? "enabled" : "disabled"})`,
          ]
            .filter(Boolean)
            .join("\n"),
          result as Record<string, unknown>,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "update_sellerhub_domain",
    {
      title: "Update SellerHub Listing",
      description:
        "Update settings for a SellerHub domain listing. You can update description, pricing, and price toggles. " +
        "Prices use { amount: string, currency: string } format.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      outputSchema: updateSellerHubDomainOutput,
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name of the SellerHub listing."),
        displayName: z.string().optional().describe("Display name for the listing."),
        description: z.string().optional().describe("Description for the listing."),
        binPriceEnabled: z.boolean().optional().describe("Enable or disable the buy-it-now price."),
        binPrice: SellerHubPriceSchema.optional().describe('Buy-it-now price (e.g. { amount: "9999", currency: "USD" }).'),
        minPriceEnabled: z.boolean().optional().describe("Enable or disable the minimum offer price."),
        minPrice: SellerHubPriceSchema.optional().describe('Minimum offer price (e.g. { amount: "100", currency: "USD" }).'),
      }),
    },
    async ({ domain, displayName, description, binPriceEnabled, binPrice, minPriceEnabled, minPrice }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        const result = await client.updateSellerHubDomain(normalizedDomain, {
          displayName,
          description,
          binPriceEnabled,
          binPrice,
          minPriceEnabled,
          minPrice,
        });
        return toTextResult(
          `Updated SellerHub listing ${result.name}: ${formatDomain(result)}`,
          result as Record<string, unknown>,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "delete_sellerhub_domain",
    {
      title: "Delete SellerHub Listing",
      description:
        "Remove a domain from the SellerHub marketplace. This deletes the listing permanently — any existing checkout links will stop working. " +
        "Always confirm with the user before calling this tool.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      outputSchema: deleteSellerHubDomainOutput,
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name to remove from SellerHub."),
      }),
    },
    async ({ domain }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        await client.deleteSellerHubDomain(normalizedDomain);
        return toTextResult(`Removed ${normalizedDomain} from SellerHub`);
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "create_checkout_link",
    {
      title: "Create Checkout Link",
      description:
        "Generate a shareable checkout/purchase link for a SellerHub domain listing. " +
        "WARNING: Anyone with this link can initiate a purchase of the domain. Only share with intended buyers. " +
        "Always confirm with the user before generating a checkout link.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      outputSchema: createCheckoutLinkOutput,
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name to create a checkout link for."),
        type: z.enum(["buyNow"]).describe('Checkout link type. Currently "buyNow" is the supported type.'),
        basePrice: SellerHubPriceSchema.optional().describe('Optional base price override for the checkout link (e.g. { amount: "9999", currency: "USD" }).'),
      }),
    },
    async ({ domain, type, basePrice }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        const result = await client.createCheckoutLink({
          type,
          domainName: normalizedDomain,
          ...(basePrice !== undefined ? { basePrice } : {}),
        });
        return toTextResult(
          [
            `Checkout link for ${normalizedDomain}: ${result.url}`,
            result.validTill ? `Valid until: ${result.validTill}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          result as Record<string, unknown>,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "get_verification_records",
    {
      title: "Get Verification Records",
      description:
        "Get the DNS verification records needed to verify ownership of SellerHub domain listings. " +
        "This returns account-level verification options (not per-domain). Each option contains DNS records to add.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      outputSchema: getVerificationRecordsOutput,
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const response = await client.getVerificationRecords();
        const allRecords = response.options.flatMap((opt) => opt.records);

        if (allRecords.length === 0) {
          return toTextResult("No verification records found.");
        }

        return toTextResult(
          [
            `Verification options (${response.options.length}):`,
            ...response.options.map((opt, i) => [
              `  Option ${i + 1}:`,
              ...opt.records.map((r) => `    - ${r.type} ${r.name} → ${r.value}`),
            ].join("\n")),
          ].join("\n"),
          response as unknown as Record<string, unknown>,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );
};
