import * as z from "zod/v4";
import type { DnsRecord } from "./types.js";

export const ContactSchema = z.object({
  contactId: z.string().optional().describe("Unique contact identifier (omit when creating a new contact)"),
  firstName: z.string().min(1).max(255).describe("First name of the contact"),
  lastName: z.string().min(1).max(255).describe("Last name of the contact"),
  organization: z.string().max(255).optional().describe("Organization or company name"),
  email: z.string().email().describe("Email address of the contact"),
  address1: z.string().min(1).max(255).describe("Primary street address"),
  address2: z.string().max(255).optional().describe("Secondary address line (apt, suite, etc.)"),
  city: z.string().min(1).max(255).describe("City name"),
  country: z.string().length(2).describe("ISO 3166-1 alpha-2 country code (e.g. US, DE, NL)"),
  stateProvince: z.string().max(255).optional().describe("State or province name/code"),
  postalCode: z.string().min(1).max(20).describe("Postal or ZIP code"),
  phone: z.string().min(1).max(30).describe("Phone number in E.164 format (e.g. +1.5551234567)"),
  phoneExtension: z.string().max(10).optional().describe("Phone extension number"),
  fax: z.string().max(30).optional().describe("Fax number in E.164 format"),
  faxExtension: z.string().max(10).optional().describe("Fax extension number"),
});

export const ContactAttributeSchema = z.object({
  attributeKey: z.string().min(1).describe("Attribute key (e.g. 'registrantVatId', 'companyNumber')"),
  attributeValue: z.string().min(1).describe("Attribute value"),
});

export const ContactsSchema = z.object({
  registrant: ContactSchema.optional().describe("Registrant contact (domain owner)"),
  admin: ContactSchema.optional().describe("Administrative contact"),
  tech: ContactSchema.optional().describe("Technical contact"),
  billing: ContactSchema.optional().describe("Billing contact"),
}).describe("Domain contacts. If omitted, account default contacts are used.");

export const WebRecordTypeSchema = z.enum([
  "A", "AAAA", "ALIAS", "CAA", "CNAME", "HTTPS", "MX", "NS", "PTR", "SRV", "SVCB", "TLSA", "TXT",
]);

const optionalTtl = z.number().int().min(60).max(86400).optional();

export const ExpectedRecordSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("A"),
    name: z.string().min(1).max(255),
    address: z.string().min(7).max(45),
    ttl: optionalTtl,
  }),
  z.object({
    type: z.literal("AAAA"),
    name: z.string().min(1).max(255),
    address: z.string().min(2).max(45),
    ttl: optionalTtl,
  }),
  z.object({
    type: z.literal("ALIAS"),
    name: z.string().min(1).max(255),
    aliasName: z.string().min(1).max(255),
    ttl: optionalTtl,
  }),
  z.object({
    type: z.literal("CAA"),
    name: z.string().min(1).max(255),
    flag: z.number().int().min(0).max(255),
    tag: z.string().min(1).max(255),
    value: z.string().min(1).max(65535),
    ttl: optionalTtl,
  }),
  z.object({
    type: z.literal("CNAME"),
    name: z.string().min(1).max(255),
    cname: z.string().min(1).max(255),
    ttl: optionalTtl,
  }),
  z.object({
    type: z.literal("HTTPS"),
    name: z.string().min(1).max(255),
    svcPriority: z.number().int().min(0).max(65535),
    targetName: z.string().min(1).max(255),
    svcParams: z.string().optional(),
    port: z.string().optional(),
    scheme: z.string().optional(),
    ttl: optionalTtl,
  }),
  z.object({
    type: z.literal("MX"),
    name: z.string().min(1).max(255),
    exchange: z.string().min(1).max(255),
    preference: z.number().int().min(0).max(65535),
    ttl: optionalTtl,
  }),
  z.object({
    type: z.literal("NS"),
    name: z.string().min(1).max(255),
    nameserver: z.string().min(1).max(255),
    ttl: optionalTtl,
  }),
  z.object({
    type: z.literal("PTR"),
    name: z.string().min(1).max(255),
    pointer: z.string().min(1).max(255),
    ttl: optionalTtl,
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
    ttl: optionalTtl,
  }),
  z.object({
    type: z.literal("SVCB"),
    name: z.string().min(1).max(255),
    svcPriority: z.number().int().min(0).max(65535),
    targetName: z.string().min(1).max(255),
    svcParams: z.string().optional(),
    port: z.string().optional(),
    scheme: z.string().optional(),
    ttl: optionalTtl,
  }),
  z.object({
    type: z.literal("TLSA"),
    name: z.string().min(1).max(255),
    port: z.string().min(1),
    protocol: z.string().min(2).max(63),
    usage: z.number().int().min(0).max(255),
    selector: z.number().int().min(0).max(255),
    matching: z.number().int().min(0).max(255),
    associationData: z.string().min(1),
    scheme: z.string().optional(),
    ttl: optionalTtl,
  }),
  z.object({
    type: z.literal("TXT"),
    name: z.string().min(1).max(255),
    value: z.string().min(1).max(65535),
    ttl: optionalTtl,
  }),
]);

export const expectedToRecord = (expected: z.infer<typeof ExpectedRecordSchema>): DnsRecord => {
  const withOptionalTtl = <T extends object>(record: T, ttl?: number): T & { ttl?: number } =>
    ttl === undefined ? record : { ...record, ttl };

  switch (expected.type) {
    case "A":
    case "AAAA":
      return withOptionalTtl(
        { type: expected.type, name: expected.name, address: expected.address },
        expected.ttl,
      );
    case "ALIAS":
      return withOptionalTtl(
        { type: "ALIAS", name: expected.name, aliasName: expected.aliasName },
        expected.ttl,
      );
    case "CAA":
      return withOptionalTtl(
        { type: "CAA", name: expected.name, flag: expected.flag, tag: expected.tag, value: expected.value },
        expected.ttl,
      );
    case "CNAME":
      return withOptionalTtl(
        { type: "CNAME", name: expected.name, cname: expected.cname },
        expected.ttl,
      );
    case "HTTPS":
      return withOptionalTtl(
        {
          type: "HTTPS", name: expected.name,
          svcPriority: expected.svcPriority, targetName: expected.targetName,
          svcParams: expected.svcParams, port: expected.port, scheme: expected.scheme,
        },
        expected.ttl,
      );
    case "MX":
      return withOptionalTtl(
        { type: "MX", name: expected.name, exchange: expected.exchange, preference: expected.preference },
        expected.ttl,
      );
    case "NS":
      return withOptionalTtl(
        { type: "NS", name: expected.name, nameserver: expected.nameserver },
        expected.ttl,
      );
    case "PTR":
      return withOptionalTtl(
        { type: "PTR", name: expected.name, pointer: expected.pointer },
        expected.ttl,
      );
    case "SRV":
      return withOptionalTtl(
        {
          type: "SRV", name: expected.name,
          service: expected.service, protocol: expected.protocol,
          priority: expected.priority, weight: expected.weight,
          port: expected.port, target: expected.target,
        },
        expected.ttl,
      );
    case "SVCB":
      return withOptionalTtl(
        {
          type: "SVCB", name: expected.name,
          svcPriority: expected.svcPriority, targetName: expected.targetName,
          svcParams: expected.svcParams, port: expected.port, scheme: expected.scheme,
        },
        expected.ttl,
      );
    case "TLSA":
      return withOptionalTtl(
        {
          type: "TLSA", name: expected.name,
          port: expected.port, protocol: expected.protocol,
          usage: expected.usage, selector: expected.selector,
          matching: expected.matching, associationData: expected.associationData,
          scheme: expected.scheme,
        },
        expected.ttl,
      );
    case "TXT":
      return withOptionalTtl(
        { type: "TXT", name: expected.name, value: expected.value },
        expected.ttl,
      );
    default:
      return expected satisfies never;
  }
};
