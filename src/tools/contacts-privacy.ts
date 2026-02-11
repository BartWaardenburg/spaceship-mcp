import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { SpaceshipClient } from "../spaceship-client.js";
import { normalizeDomain } from "../dns-utils.js";
import { ContactSchema, ContactAttributeSchema } from "../schemas.js";
import { toTextResult, toErrorResult } from "../tool-result.js";

export const registerContactsPrivacyTools = (server: McpServer, client: SpaceshipClient): void => {
  server.registerTool(
    "save_contact",
    {
      title: "Save Contact",
      description:
        "Create or update a reusable contact profile. Saved contacts can be referenced when registering domains or updating domain contacts. If a contactId is provided, the existing contact is updated; otherwise a new contact is created.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: ContactSchema,
    },
    async (input) => {
      try {
        const contact = await client.saveContact(input);
        return toTextResult(
          [
            `Contact saved successfully.`,
            `ID: ${contact.contactId ?? "N/A"}`,
            `Name: ${contact.firstName} ${contact.lastName}`,
            contact.organization ? `Organization: ${contact.organization}` : null,
            `Email: ${contact.email}`,
          ]
            .filter(Boolean)
            .join("\n"),
          contact as unknown as Record<string, unknown>,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "get_contact",
    {
      title: "Get Contact",
      description: "Retrieve a saved contact profile by its unique identifier.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: z.object({
        contactId: z.string().min(1).describe("The unique identifier of the contact to retrieve"),
      }),
    },
    async ({ contactId }) => {
      try {
        const contact = await client.getContact(contactId);
        return toTextResult(
          [
            `Contact: ${contact.firstName} ${contact.lastName}`,
            `ID: ${contact.contactId ?? "N/A"}`,
            contact.organization ? `Organization: ${contact.organization}` : null,
            `Email: ${contact.email}`,
            `Address: ${contact.address1}${contact.address2 ? `, ${contact.address2}` : ""}`,
            `City: ${contact.city}, ${contact.stateProvince ?? ""} ${contact.postalCode}`,
            `Country: ${contact.country}`,
            `Phone: ${contact.phone}${contact.phoneExtension ? ` ext. ${contact.phoneExtension}` : ""}`,
          ]
            .filter(Boolean)
            .join("\n"),
          contact as unknown as Record<string, unknown>,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "save_contact_attributes",
    {
      title: "Save Contact Attributes",
      description:
        "Save TLD-specific contact attributes required for certain domain registrations. " +
        "Different TLDs require different fields. Example for .us: { type: \"us\", appPurpose: \"P1\", nexusCategory: \"C11\" }. " +
        "Returns the contactId associated with the saved attributes.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        attributes: z.record(z.string(), z.string()).describe(
          "TLD-specific attribute key-value pairs. Example for .us: { type: \"us\", appPurpose: \"P1\", nexusCategory: \"C11\" }",
        ),
      }),
    },
    async ({ attributes }) => {
      try {
        const result = await client.saveContactAttributes(attributes);
        const entries = Object.entries(attributes);
        return toTextResult(
          [
            `Successfully saved ${entries.length} contact attribute(s) (contactId: ${result.contactId}):`,
            ...entries.map(([key, value]) => `  - ${key}: ${value}`),
          ].join("\n"),
          { contactId: result.contactId, attributes },
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "get_contact_attributes",
    {
      title: "Get Contact Attributes",
      description:
        "Retrieve stored contact attributes for a specific contact (TLD-specific extra fields like tax IDs and company registration numbers). " +
        "Use get_domain first to find the contact ID, then use this tool to retrieve its attributes.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: z.object({
        contactId: z.string().min(1).describe("The unique identifier of the contact to get attributes for. Use get_domain to find the contact ID."),
      }),
    },
    async ({ contactId }) => {
      try {
        const attributes = await client.getContactAttributes(contactId);

        if (attributes.length === 0) {
          return toTextResult("No contact attributes found.");
        }

        return toTextResult(
          [
            `Contact attributes (${attributes.length}):`,
            ...attributes.map((a) => `  - ${a.attributeKey}: ${a.attributeValue}`),
          ].join("\n"),
          { attributes } as Record<string, unknown>,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "update_domain_contacts",
    {
      title: "Update Domain Contacts",
      description:
        "Update the contacts (registrant, admin, tech, billing) for a specific domain. " +
        "WARNING: Changing the registrant contact may trigger an ICANN 60-day transfer lock on the domain, preventing transfers for 60 days. " +
        "Only the contact roles you provide will be updated; omitted roles remain unchanged. " +
        "Always confirm with the user before calling this tool — show which contact roles will be changed.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name to update contacts for"),
        registrant: ContactSchema.optional().describe("Registrant contact (domain owner). Changing this may trigger an ICANN transfer lock."),
        admin: ContactSchema.optional().describe("Administrative contact"),
        tech: ContactSchema.optional().describe("Technical contact"),
        billing: ContactSchema.optional().describe("Billing contact"),
        attributes: z
          .array(ContactAttributeSchema)
          .optional()
          .describe("TLD-specific contact attributes"),
      }),
    },
    async ({ domain, registrant, admin, tech, billing, attributes }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        await client.updateDomainContacts(normalizedDomain, {
          registrant,
          admin,
          tech,
          billing,
          attributes,
        });

        const updatedRoles = [
          registrant ? "registrant" : null,
          admin ? "admin" : null,
          tech ? "tech" : null,
          billing ? "billing" : null,
        ].filter(Boolean);

        return toTextResult(
          `Successfully updated contacts for ${normalizedDomain}: ${updatedRoles.join(", ")}${attributes ? ` (with ${attributes.length} attribute(s))` : ""}`,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "set_privacy_level",
    {
      title: "Set WHOIS Privacy Level",
      description:
        'Set the WHOIS privacy level for a domain. "high" enables full privacy protection, hiding your personal information from public WHOIS lookups. "public" makes your contact details visible in WHOIS results. ' +
        'WARNING: Setting privacy to "public" exposes personal contact information (name, address, email, phone) in public WHOIS databases, which cannot be un-cached once indexed by third parties. ' +
        "Always confirm with the user before setting privacy to public.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name"),
        level: z
          .enum(["high", "public"])
          .describe('"high" for full WHOIS privacy, "public" to make contact info visible'),
        userConsent: z
          .boolean()
          .describe("Explicit user consent for the privacy change (required by the API). Must be true to proceed."),
      }),
    },
    async ({ domain, level, userConsent }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        await client.setPrivacyLevel(normalizedDomain, level, userConsent);

        return toTextResult(
          `WHOIS privacy for ${normalizedDomain} set to "${level}"${level === "high" ? " (contact info hidden)" : " (contact info visible)"}`,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "set_email_protection",
    {
      title: "Set Email Protection",
      description:
        "Toggle the contact form display for a domain's WHOIS listing. When enabled, a contact form is shown instead of the raw email address, helping protect against spam and email harvesting. " +
        "WARNING: Disabling email protection exposes the registrant's email address in WHOIS, increasing spam and phishing risk. " +
        "Always confirm with the user before disabling email protection.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        domain: z.string().min(4).max(255).describe("The domain name"),
        contactForm: z
          .boolean()
          .describe("Enable (true) to show a contact form instead of email, or disable (false) to show the email directly"),
      }),
    },
    async ({ domain, contactForm }) => {
      try {
        const normalizedDomain = normalizeDomain(domain);
        await client.setEmailProtection(normalizedDomain, contactForm);

        return toTextResult(
          `Email protection for ${normalizedDomain}: contact form ${contactForm ? "enabled" : "disabled"}`,
        );
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );
};
