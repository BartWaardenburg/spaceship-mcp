import { describe, it, expect } from "vitest";
import { createServer } from "./server.js";
import type { SpaceshipClient } from "./spaceship-client.js";

const mockClient = {} as SpaceshipClient;

type RegisteredTool = { annotations?: Record<string, unknown> };
type ServerWithTools = { _registeredTools: Record<string, RegisteredTool> };

const getTools = (): Record<string, RegisteredTool> =>
  (createServer(mockClient) as unknown as ServerWithTools)._registeredTools;

describe("createServer", () => {
  it("creates a server", () => {
    const server = createServer(mockClient);
    expect(server).toBeDefined();
  });

  it("registers all 47 tools", () => {
    const tools = getTools();
    expect(Object.keys(tools)).toHaveLength(47);
  });

  it("registers all expected tool names", () => {
    const tools = getTools();

    const expectedTools = [
      // DNS Records
      "list_dns_records",
      "save_dns_records",
      "delete_dns_records",
      // DNS Record Creators
      "create_a_record",
      "create_aaaa_record",
      "create_cname_record",
      "create_mx_record",
      "create_srv_record",
      "create_txt_record",
      "create_alias_record",
      "create_caa_record",
      "create_https_record",
      "create_ns_record",
      "create_ptr_record",
      "create_svcb_record",
      "create_tlsa_record",
      // Domain Management
      "list_domains",
      "get_domain",
      "check_domain_availability",
      "update_nameservers",
      "set_auto_renew",
      "set_transfer_lock",
      "get_auth_code",
      // Domain Lifecycle
      "register_domain",
      "renew_domain",
      "restore_domain",
      "transfer_domain",
      "get_transfer_status",
      "get_async_operation",
      // Contacts & Privacy
      "save_contact",
      "get_contact",
      "save_contact_attributes",
      "get_contact_attributes",
      "update_domain_contacts",
      "set_privacy_level",
      "set_email_protection",
      // SellerHub
      "list_sellerhub_domains",
      "create_sellerhub_domain",
      "get_sellerhub_domain",
      "update_sellerhub_domain",
      "delete_sellerhub_domain",
      "create_checkout_link",
      "get_verification_records",
      // Personal Nameservers
      "list_personal_nameservers",
      "update_personal_nameserver",
      "delete_personal_nameserver",
      // Analysis
      "check_dns_alignment",
    ];

    for (const name of expectedTools) {
      expect(name in tools, `Tool "${name}" should be registered`).toBe(true);
    }
  });

  it("all tools have annotations", () => {
    const tools = getTools();

    for (const [name, tool] of Object.entries(tools)) {
      expect(tool.annotations, `Tool "${name}" should have annotations`).toBeDefined();
    }
  });
});
