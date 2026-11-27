import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/server";
import type { SpaceshipClient } from "./spaceship-client.js";
import { registerDnsRecordTools } from "./tools/dns-records.js";
import { registerDnsRecordCreatorTools } from "./tools/dns-record-creators.js";
import { registerDomainManagementTools } from "./tools/domain-management.js";
import { registerDomainLifecycleTools } from "./tools/domain-lifecycle.js";
import { registerContactsPrivacyTools } from "./tools/contacts-privacy.js";
import { registerSellerHubTools } from "./tools/sellerhub.js";
import { registerPersonalNameserverTools } from "./tools/personal-nameservers.js";
import { registerAnalysisTools } from "./tools/analysis.js";
import { registerPrompts } from "./prompts.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

export type Toolset = "domains" | "dns" | "contacts" | "privacy" | "nameservers" | "sellerhub" | "availability";

const ALL_TOOLSETS: Toolset[] = ["domains", "dns", "contacts", "privacy", "nameservers", "sellerhub", "availability"];

export const parseToolsets = (env?: string): Set<Toolset> => {
  if (!env) return new Set(ALL_TOOLSETS);

  const requested = env.split(",").map((s) => s.trim().toLowerCase());
  const valid = new Set<Toolset>();

  for (const name of requested) {
    if (ALL_TOOLSETS.includes(name as Toolset)) {
      valid.add(name as Toolset);
    }
  }

  return valid.size > 0 ? valid : new Set(ALL_TOOLSETS);
};

const INSTRUCTIONS = [
  "Manage domains, DNS records, contacts and marketplace listings with the Spaceship API.",
  "To find a domain, call list_domains or check_domain_availability. Then call get_domain for details.",
  "To change DNS, call list_dns_records first. Then call save_dns_records or a create tool such as create_a_record.",
  "Set the env vars SPACESHIP_API_KEY and SPACESHIP_API_SECRET before you start.",
  "Tools such as delete_dns_records change live data. Confirm with the user before you call them.",
].join("\n");

type ToolRegisterer = (server: McpServer, client: SpaceshipClient) => void;

const toolsetRegistry: Record<Toolset, ToolRegisterer[]> = {
  domains: [registerDomainManagementTools, registerDomainLifecycleTools],
  dns: [registerDnsRecordTools, registerDnsRecordCreatorTools, registerAnalysisTools],
  contacts: [registerContactsPrivacyTools],
  privacy: [registerContactsPrivacyTools],
  nameservers: [registerPersonalNameserverTools],
  sellerhub: [registerSellerHubTools],
  availability: [registerDomainManagementTools],
};

export const createServer = (
  client: SpaceshipClient,
  toolsets?: Set<Toolset>,
): McpServer => {
  const server = new McpServer(
    {
      name: "spaceship-mcp",
      title: "Spaceship",
      version,
      websiteUrl: "https://www.spaceship.com",
    },
    { instructions: INSTRUCTIONS },
  );

  const enabled = toolsets ?? new Set(ALL_TOOLSETS);
  const registered = new Set<ToolRegisterer>();

  // Iterate the fixed list, not the user input, so tools/list has one stable order.
  for (const toolset of ALL_TOOLSETS.filter((t) => enabled.has(t))) {
    const registerers = toolsetRegistry[toolset];

    for (const register of registerers) {
      if (!registered.has(register)) {
        registered.add(register);
        register(server, client);
      }
    }
  }

  registerPrompts(server, client);

  return server;
};
