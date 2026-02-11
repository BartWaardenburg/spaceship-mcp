import * as z from "zod/v4";

// --- Common building blocks ---

const DnsRecordOutput = z.object({
  type: z.string(),
  name: z.string(),
  ttl: z.number().optional(),
  address: z.string().optional(),
  aliasName: z.string().optional(),
  flag: z.number().optional(),
  tag: z.string().optional(),
  value: z.string().optional(),
  cname: z.string().optional(),
  svcPriority: z.number().optional(),
  targetName: z.string().optional(),
  svcParams: z.string().optional(),
  exchange: z.string().optional(),
  preference: z.number().optional(),
  nameserver: z.string().optional(),
  pointer: z.string().optional(),
  service: z.string().optional(),
  protocol: z.string().optional(),
  priority: z.number().optional(),
  weight: z.number().optional(),
  port: z.union([z.number(), z.string()]).optional(),
  target: z.string().optional(),
  scheme: z.string().optional(),
  usage: z.number().optional(),
  selector: z.number().optional(),
  matching: z.number().optional(),
  associationData: z.string().optional(),
});

const DomainOutput = z.object({
  name: z.string(),
  unicode: z.string().optional(),
  isPremium: z.boolean().optional(),
  registrationDate: z.string().optional(),
  expirationDate: z.string().optional(),
  autoRenew: z.boolean().optional(),
  lifecycleStatus: z.string().optional(),
  verificationStatus: z.string().optional(),
  eppStatuses: z.array(z.string()).optional(),
  privacyProtection: z.object({
    contactForm: z.boolean().optional(),
    level: z.enum(["high", "public"]).optional(),
  }).optional(),
  nameservers: z.object({
    provider: z.string().optional(),
    hosts: z.array(z.string()).optional(),
  }).optional(),
});

const SellerHubPriceOutput = z.object({
  amount: z.string(),
  currency: z.string(),
});

const SellerHubDomainOutput = z.object({
  name: z.string(),
  unicodeName: z.string().optional(),
  displayName: z.string().optional(),
  status: z.string().optional(),
  description: z.string().optional(),
  binPriceEnabled: z.boolean().optional(),
  binPrice: SellerHubPriceOutput.optional(),
  minPriceEnabled: z.boolean().optional(),
  minPrice: SellerHubPriceOutput.optional(),
});

const ContactOutput = z.object({
  contactId: z.string().optional(),
  firstName: z.string(),
  lastName: z.string(),
  organization: z.string().optional(),
  email: z.string(),
  address1: z.string(),
  address2: z.string().optional(),
  city: z.string(),
  country: z.string(),
  stateProvince: z.string().optional(),
  postalCode: z.string().optional(),
  phone: z.string(),
  phoneExt: z.string().optional(),
  fax: z.string().optional(),
  faxExt: z.string().optional(),
  taxNumber: z.string().optional(),
});

const PersonalNameserverOutput = z.object({
  host: z.string(),
  ips: z.array(z.string()).optional(),
});

// --- DNS Records ---

export const listDnsRecordsOutput = z.object({
  domain: z.string(),
  count: z.number(),
  byType: z.record(z.string(), z.number()),
  items: z.array(DnsRecordOutput),
});

export const saveDnsRecordsOutput = z.object({
  message: z.string(),
});

export const deleteDnsRecordsOutput = z.object({
  message: z.string(),
});

// --- DNS Record Creators ---

export const createRecordOutput = z.object({
  message: z.string(),
});

// --- Domain Management ---

export const listDomainsOutput = z.object({
  count: z.number(),
  domains: z.array(DomainOutput),
});

export const getDomainOutput = DomainOutput;

export const checkDomainAvailabilityOutput = z.object({
  results: z.array(z.object({
    domain: z.string(),
    available: z.boolean(),
    result: z.string(),
    premiumPricing: z.array(z.object({
      duration: z.number().optional(),
      registerPrice: z.number().optional(),
      renewPrice: z.number().optional(),
      currency: z.string().optional(),
    })).optional(),
  })),
});

export const updateNameserversOutput = z.object({
  message: z.string(),
});

export const setAutoRenewOutput = z.object({
  message: z.string(),
});

export const setTransferLockOutput = z.object({
  message: z.string(),
});

export const getAuthCodeOutput = z.object({
  authCode: z.string(),
  expires: z.string(),
});

// --- Domain Lifecycle ---

export const asyncOperationStartOutput = z.object({
  operationId: z.string(),
  domain: z.string(),
});

export const getTransferStatusOutput = z.object({
  status: z.string(),
});

export const getAsyncOperationOutput = z.object({
  operationId: z.string(),
  status: z.enum(["pending", "success", "failed"]),
  type: z.string(),
  details: z.unknown().optional(),
  createdAt: z.string().optional(),
  modifiedAt: z.string().optional(),
});

// --- Contacts & Privacy ---

export const saveContactOutput = z.object({
  contactId: z.string(),
});

export const getContactOutput = ContactOutput;

export const saveContactAttributesOutput = z.object({
  contactId: z.string(),
  attributes: z.record(z.string(), z.string()),
});

export const getContactAttributesOutput = z.object({
  attributes: z.record(z.string(), z.string()),
});

export const updateDomainContactsOutput = z.object({
  message: z.string(),
  verificationStatus: z.string().nullable().optional(),
});

export const setPrivacyLevelOutput = z.object({
  message: z.string(),
});

export const setEmailProtectionOutput = z.object({
  message: z.string(),
});

// --- SellerHub ---

export const listSellerHubDomainsOutput = z.object({
  count: z.number(),
  domains: z.array(SellerHubDomainOutput),
});

export const createSellerHubDomainOutput = SellerHubDomainOutput;

export const getSellerHubDomainOutput = SellerHubDomainOutput;

export const updateSellerHubDomainOutput = SellerHubDomainOutput;

export const deleteSellerHubDomainOutput = z.object({
  message: z.string(),
});

export const createCheckoutLinkOutput = z.object({
  url: z.string(),
  validTill: z.string().optional(),
});

export const getVerificationRecordsOutput = z.object({
  options: z.array(z.object({
    records: z.array(z.object({
      type: z.string(),
      name: z.string(),
      value: z.string(),
    })),
  })),
});

// --- Personal Nameservers ---

export const listPersonalNameserversOutput = z.object({
  nameservers: z.array(PersonalNameserverOutput),
});

export const getPersonalNameserverOutput = PersonalNameserverOutput;

export const updatePersonalNameserverOutput = z.object({
  message: z.string(),
});

export const deletePersonalNameserverOutput = z.object({
  message: z.string(),
});

// --- Analysis ---

export const checkDnsAlignmentOutput = z.object({
  domain: z.string(),
  includeTtlInMatch: z.boolean(),
  missing: z.array(DnsRecordOutput),
  unexpected: z.array(DnsRecordOutput),
});
