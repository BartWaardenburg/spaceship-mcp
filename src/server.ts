import { createRequire } from "node:module";
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
import { registerCompletablePrompts } from "./completions.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

export const createServer = (client: SpaceshipClient): McpServer => {
  const server = new McpServer({
    name: "spaceship-mcp",
    version,
  });

  registerDnsRecordTools(server, client);
  registerDnsRecordCreatorTools(server, client);
  registerDomainManagementTools(server, client);
  registerDomainLifecycleTools(server, client);
  registerContactsPrivacyTools(server, client);
  registerSellerHubTools(server, client);
  registerPersonalNameserverTools(server, client);
  registerAnalysisTools(server, client);
  registerCompletablePrompts(server, client);

  return server;
};
