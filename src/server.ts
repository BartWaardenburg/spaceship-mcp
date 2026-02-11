import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpaceshipClient } from "./spaceship-client.js";
import { registerDnsRecordTools } from "./tools/dns-records.js";
import { registerDnsRecordCreatorTools } from "./tools/dns-record-creators.js";
import { registerDomainManagementTools } from "./tools/domain-management.js";
import { registerDomainLifecycleTools } from "./tools/domain-lifecycle.js";
import { registerContactsPrivacyTools } from "./tools/contacts-privacy.js";
import { registerSellerHubTools } from "./tools/sellerhub.js";
import { registerPersonalNameserverTools } from "./tools/personal-nameservers.js";
import { registerAnalysisTools } from "./tools/analysis.js";

export const createServer = (client: SpaceshipClient): McpServer => {
  const server = new McpServer({
    name: "spaceship-mcp",
    version: "0.1.0",
  });

  registerDnsRecordTools(server, client);
  registerDnsRecordCreatorTools(server, client);
  registerDomainManagementTools(server, client);
  registerDomainLifecycleTools(server, client);
  registerContactsPrivacyTools(server, client);
  registerSellerHubTools(server, client);
  registerPersonalNameserverTools(server, client);
  registerAnalysisTools(server, client);

  return server;
};
