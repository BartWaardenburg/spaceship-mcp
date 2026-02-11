// --- DNS Records ---

export interface DnsRecord {
  type: string;
  name: string;
  ttl?: number;
  group?: string;

  // A, AAAA
  address?: string;

  // ALIAS
  aliasName?: string;

  // CAA
  flag?: number;
  tag?: string;

  // CNAME
  cname?: string;

  // HTTPS, SVCB
  svcPriority?: number;
  targetName?: string;
  svcParams?: string;

  // MX
  exchange?: string;
  preference?: number;

  // NS
  nameserver?: string;

  // PTR
  pointer?: string;

  // SRV
  service?: string;
  protocol?: string;
  priority?: number;
  weight?: number;
  port?: number | string;
  target?: string;

  // HTTPS, SVCB, TLSA
  scheme?: string;

  // TLSA
  usage?: number;
  selector?: number;
  matching?: number;
  associationData?: string;

  // TXT, CAA, generic
  value?: string;

  [key: string]: unknown;
}

export interface DnsRecordToDelete {
  name: string;
  type: string;
}

export interface ListDnsRecordsResponse {
  items: DnsRecord[];
  total: number;
}

export type OrderBy = "type" | "-type" | "name" | "-name";

// --- Domains ---

export type DomainOrderBy =
  | "name"
  | "-name"
  | "unicodeName"
  | "-unicodeName"
  | "registrationDate"
  | "-registrationDate"
  | "expirationDate"
  | "-expirationDate";

export interface PrivacyProtection {
  contactForm?: boolean;
  level?: "high" | "public";
}

export interface Domain {
  name: string;
  unicode?: string;
  isPremium?: boolean;
  registrationDate?: string;
  expirationDate?: string;
  autoRenew?: boolean;
  lifecycleStatus?: string;
  verificationStatus?: string;
  eppStatuses?: string[];
  suspensions?: string[];
  privacyProtection?: PrivacyProtection;
  nameservers?: {
    provider?: string;
    hosts?: string[];
  };
  contacts?: DomainContacts;
  [key: string]: unknown;
}

export interface ListDomainsResponse {
  items: Domain[];
  total: number;
}

export interface DomainAvailabilityRaw {
  domain: string;
  result: "available" | "taken" | string;
  premiumPricing?: { duration?: number; registerPrice?: number; renewPrice?: number; currency?: string }[];
  [key: string]: unknown;
}

export interface DomainAvailability {
  domain: string;
  available: boolean;
  result: string;
  premiumPricing?: { duration?: number; registerPrice?: number; renewPrice?: number; currency?: string }[];
  [key: string]: unknown;
}

// --- Contacts ---

export interface Contact {
  contactId?: string;
  firstName: string;
  lastName: string;
  organization?: string;
  email: string;
  address1: string;
  address2?: string;
  city: string;
  country: string;
  stateProvince?: string;
  postalCode: string;
  phone: string;
  phoneExtension?: string;
  fax?: string;
  faxExtension?: string;
}

export interface ContactAttribute {
  attributeKey: string;
  attributeValue: string;
}

export interface DomainContacts {
  registrant?: Contact;
  admin?: Contact;
  tech?: Contact;
  billing?: Contact;
  attributes?: ContactAttribute[];
}

// --- Domain Lifecycle ---

export interface DomainRegistrationRequest {
  autoRenew?: boolean;
  years?: number;
  privacyProtection?: {
    level?: "high" | "public";
    userConsent?: boolean;
  };
  contacts?: DomainContacts;
}

export interface DomainRenewalRequest {
  years: number;
  currentExpirationDate: string;
}

export interface DomainTransferRequest {
  autoRenew?: boolean;
  authCode?: string;
  privacyProtection?: {
    level?: "high" | "public";
    userConsent?: boolean;
  };
  contacts?: DomainContacts;
}

export interface TransferStatus {
  status: string;
  [key: string]: unknown;
}

// --- Async Operations ---

export interface AsyncOperation {
  status: "pending" | "success" | "failed";
  type: string;
  details?: unknown;
  createdAt?: string;
  modifiedAt?: string;
}

// --- Personal Nameservers ---

export interface PersonalNameserver {
  host: string;
  ips?: string[];
}

export interface PersonalNameserverResponse {
  records: PersonalNameserver[];
}

// --- SellerHub ---

export interface SellerHubPrice {
  amount: string;
  currency: string;
}

export interface SellerHubDomain {
  name: string;
  unicodeName?: string;
  displayName?: string;
  status?: string;
  description?: string;
  binPriceEnabled?: boolean;
  binPrice?: SellerHubPrice;
  minPriceEnabled?: boolean;
  minPrice?: SellerHubPrice;
  [key: string]: unknown;
}

export interface ListSellerHubDomainsResponse {
  items: SellerHubDomain[];
  total: number;
}

export interface SellerHubCheckoutLink {
  url: string;
  [key: string]: unknown;
}

export interface SellerHubVerificationRecord {
  type: string;
  name: string;
  value: string;
  [key: string]: unknown;
}
