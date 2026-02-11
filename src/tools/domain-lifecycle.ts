import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { SpaceshipClient } from "../spaceship-client.js";
import { normalizeDomain } from "../dns-utils.js";
import { toTextResult, toErrorResult } from "../tool-result.js";

const ContactIdsSchema = z.object({
  registrant: z.string().min(1).optional().describe("Registrant contact ID"),
  admin: z.string().min(1).optional().describe("Administrative contact ID"),
  tech: z.string().min(1).optional().describe("Technical contact ID"),
  billing: z.string().min(1).optional().describe("Billing contact ID"),
}).describe("Domain contacts by ID. Use save_contact first to create contacts and obtain IDs.");

export const registerDomainLifecycleTools = (server: McpServer, client: SpaceshipClient): void => {
  server.registerTool(
    "register_domain",
    {
      title: "Register Domain",
      description:
        "Register a new domain name. WARNING: This is a FINANCIAL operation that will charge money to the Spaceship account. " +
        "Registration is irreversible — once completed, the domain is registered and the charge cannot be undone. " +
        "This operation is asynchronous: it returns an operationId that must be polled with get_async_operation to check completion status. " +
        "Always confirm with the user before calling this tool. Use check_domain_availability first to verify the domain is available.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },

      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name to register (e.g. 'example.com')"),
        years: z.number().int().min(1).max(10).default(1).describe("Number of years to register for (1-10, default 1)"),
        autoRenew: z.boolean().default(true).describe("Enable auto-renewal (default true)"),
        privacyLevel: z.enum(["high", "public"]).default("high").describe("Privacy protection level: 'high' hides WHOIS info, 'public' shows it (default 'high')"),
        contacts: ContactIdsSchema.optional(),
      }),
    },
    async ({ domain, years, autoRenew, privacyLevel, contacts }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        const result = await client.registerDomain(normalizedDomain, {
          years,
          autoRenew,
          privacyProtection: { level: privacyLevel, userConsent: true },
          ...(contacts ? { contacts } : {}),
        });

        return toTextResult(
          [
            `Domain registration initiated for ${normalizedDomain}`,
            `Operation ID: ${result.operationId}`,
            `Years: ${years}, Auto-renew: ${autoRenew}, Privacy: ${privacyLevel}`,
            "Use get_async_operation to poll the operation status.",
          ].join("\n"),
          { operationId: result.operationId, domain: normalizedDomain },
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "renew_domain",
    {
      title: "Renew Domain",
      description:
        "Renew an existing domain registration. WARNING: This is a FINANCIAL operation that will charge money to the Spaceship account. " +
        "The currentExpirationDate parameter is required to prevent accidental double renewals — it must match the domain's actual expiration date. " +
        "Use get_domain first to retrieve the current expiration date. " +
        "Always confirm with the user before calling this tool — show the domain name, renewal years, and estimated cost. " +
        "This operation is asynchronous: it returns an operationId that must be polled with get_async_operation to check completion status.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },

      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name to renew"),
        years: z.number().int().min(1).max(10).describe("Number of years to renew for (1-10)"),
        currentExpirationDate: z.string().describe("Current expiration date of the domain in ISO 8601 format (e.g. '2025-12-31'). Must match the actual expiration date to prevent accidental double renewals."),
      }),
    },
    async ({ domain, years, currentExpirationDate }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        const result = await client.renewDomain(normalizedDomain, {
          years,
          currentExpirationDate,
        });

        return toTextResult(
          [
            `Domain renewal initiated for ${normalizedDomain}`,
            `Operation ID: ${result.operationId}`,
            `Years: ${years}, Current expiration: ${currentExpirationDate}`,
            "Use get_async_operation to poll the operation status.",
          ].join("\n"),
          { operationId: result.operationId, domain: normalizedDomain },
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "restore_domain",
    {
      title: "Restore Domain",
      description:
        "Restore a domain that is in the redemption grace period after expiration or deletion. WARNING: This is a FINANCIAL operation that typically costs significantly more than a standard registration or renewal. " +
        "Only domains in the redemption period can be restored — domains that have been fully released cannot be recovered with this tool. " +
        "Always confirm with the user before calling this tool — restoration fees are typically much higher than standard registration. " +
        "This operation is asynchronous: it returns an operationId that must be polled with get_async_operation to check completion status.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },

      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name to restore from redemption period"),
      }),
    },
    async ({ domain }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        const result = await client.restoreDomain(normalizedDomain);

        return toTextResult(
          [
            `Domain restore initiated for ${normalizedDomain}`,
            `Operation ID: ${result.operationId}`,
            "Use get_async_operation to poll the operation status.",
          ].join("\n"),
          { operationId: result.operationId, domain: normalizedDomain },
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "transfer_domain",
    {
      title: "Transfer Domain",
      description:
        "Transfer a domain TO Spaceship from another registrar. WARNING: This is a FINANCIAL operation that will charge money to the Spaceship account (transfers typically include a 1-year renewal). " +
        "The transfer process: 1) Unlock the domain at the current registrar, 2) Get the auth/EPP code from the current registrar, 3) Call this tool with the auth code, 4) Approve the transfer via email (if required by the TLD). " +
        "Some TLDs (e.g. .uk) do not require an auth code. Transfers can take up to 5-7 days depending on the TLD. " +
        "Always confirm with the user before calling this tool — show the domain name and explain the transfer process. " +
        "This operation is asynchronous: it returns an operationId. Use get_transfer_status to check the transfer progress and get_async_operation to check the operation status.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },

      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name to transfer to Spaceship"),
        authCode: z.string().max(255).optional().describe("Authorization/EPP code from the current registrar. Required for most TLDs, but some (e.g. .uk) do not need one."),
        autoRenew: z.boolean().default(true).describe("Enable auto-renewal after transfer (default true)"),
        privacyLevel: z.enum(["high", "public"]).default("high").describe("Privacy protection level: 'high' hides WHOIS info, 'public' shows it (default 'high')"),
        contacts: ContactIdsSchema.optional(),
      }),
    },
    async ({ domain, authCode, autoRenew, privacyLevel, contacts }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        const result = await client.transferDomain(normalizedDomain, {
          autoRenew,
          privacyProtection: { level: privacyLevel, userConsent: true },
          ...(authCode ? { authCode } : {}),
          ...(contacts ? { contacts } : {}),
        });

        return toTextResult(
          [
            `Domain transfer initiated for ${normalizedDomain}`,
            `Operation ID: ${result.operationId}`,
            `Auto-renew: ${autoRenew}, Privacy: ${privacyLevel}`,
            "Use get_transfer_status to monitor transfer progress.",
            "Use get_async_operation to check the operation status.",
          ].join("\n"),
          { operationId: result.operationId, domain: normalizedDomain },
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "get_transfer_status",
    {
      title: "Get Transfer Status",
      description: "Check the current status of a domain transfer to Spaceship. Use this after initiating a transfer with transfer_domain to monitor its progress.",
      annotations: { readOnlyHint: true, openWorldHint: true },

      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name to check transfer status for"),
      }),
    },
    async ({ domain }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        const status = await client.getTransferStatus(normalizedDomain);

        return toTextResult(
          [
            `Transfer status for ${normalizedDomain}: ${status.status}`,
            ...Object.entries(status)
              .filter(([key]) => key !== "status")
              .map(([key, value]) => `  ${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`),
          ].join("\n"),
          status as unknown as Record<string, unknown>,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "get_async_operation",
    {
      title: "Get Async Operation Status",
      description:
        "Poll the status of an asynchronous operation by its operation ID. " +
        "Operations like domain registration, renewal, restore, and transfer are async — they return an operationId immediately and process in the background. " +
        "Call this tool with the operationId to check if the operation has completed. " +
        "Possible statuses: 'pending' (still processing), 'success' (completed successfully), 'failed' (operation failed — check details for reason).",
      annotations: { readOnlyHint: true, openWorldHint: true },

      inputSchema: z.object({
        operationId: z.string().min(1).describe("The operation ID returned by an async operation (register_domain, renew_domain, restore_domain, or transfer_domain)"),
      }),
    },
    async ({ operationId }) => {
      try {
        const operation = await client.getAsyncOperation(operationId);

        return toTextResult(
          [
            `Operation ${operationId}: ${operation.status}`,
            operation.type ? `Type: ${operation.type}` : null,
            operation.createdAt ? `Created: ${operation.createdAt}` : null,
            operation.modifiedAt ? `Modified: ${operation.modifiedAt}` : null,
            operation.details ? `Details: ${JSON.stringify(operation.details, null, 2)}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          { operationId, ...operation } as Record<string, unknown>,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );
};
