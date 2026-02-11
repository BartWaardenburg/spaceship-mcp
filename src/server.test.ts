import { describe, it, expect } from "vitest";
import { createServer, parseToolsets } from "./server.js";
import type { SpaceshipClient } from "./spaceship-client.js";

const mockClient = {} as SpaceshipClient;

type RegisteredTool = { annotations?: Record<string, unknown> };
type ServerWithTools = { _registeredTools: Record<string, RegisteredTool> };

const getTools = (toolsets?: Set<string>): Record<string, RegisteredTool> =>
  (createServer(mockClient, toolsets as never) as unknown as ServerWithTools)._registeredTools;

describe("createServer", () => {
  it("creates a server", () => {
    const server = createServer(mockClient);
    expect(server).toBeDefined();
  });

  it("registers all 48 tools", () => {
    const tools = getTools();
    expect(Object.keys(tools)).toHaveLength(48);
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
      "get_personal_nameserver",
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

  it("registers all 9 prompts (5 guided + 4 completable)", () => {
    type ServerWithPrompts = { _registeredPrompts: Record<string, unknown> };
    const server = createServer(mockClient) as unknown as ServerWithPrompts;
    const prompts = Object.keys(server._registeredPrompts);
    expect(prompts).toHaveLength(9);
    // Guided prompts
    expect(prompts).toContain("setup-domain");
    expect(prompts).toContain("audit-domain");
    expect(prompts).toContain("setup-email");
    expect(prompts).toContain("migrate-dns");
    expect(prompts).toContain("list-for-sale");
    // Completable prompts
    expect(prompts).toContain("domain-lookup");
    expect(prompts).toContain("dns-records");
    expect(prompts).toContain("set-privacy");
    expect(prompts).toContain("update-nameservers");
  });
});

describe("parseToolsets", () => {
  it("returns all toolsets when env is undefined", () => {
    const result = parseToolsets(undefined);
    expect(result.size).toBe(7);
  });

  it("returns all toolsets when env is empty", () => {
    const result = parseToolsets("");
    expect(result.size).toBe(7);
  });

  it("parses a single toolset", () => {
    const result = parseToolsets("dns");
    expect(result).toEqual(new Set(["dns"]));
  });

  it("parses multiple toolsets", () => {
    const result = parseToolsets("dns,domains,sellerhub");
    expect(result).toEqual(new Set(["dns", "domains", "sellerhub"]));
  });

  it("ignores invalid toolset names", () => {
    const result = parseToolsets("dns,invalid,domains");
    expect(result).toEqual(new Set(["dns", "domains"]));
  });

  it("returns all toolsets if all names are invalid", () => {
    const result = parseToolsets("invalid,unknown");
    expect(result.size).toBe(7);
  });

  it("handles whitespace in toolset names", () => {
    const result = parseToolsets(" dns , domains ");
    expect(result).toEqual(new Set(["dns", "domains"]));
  });
});

describe("toolset filtering", () => {
  it("registers only dns tools when dns toolset is selected", () => {
    const tools = getTools(new Set(["dns"]) as never);
    expect("list_dns_records" in tools).toBe(true);
    expect("create_a_record" in tools).toBe(true);
    expect("check_dns_alignment" in tools).toBe(true);
    expect("list_domains" in tools).toBe(false);
    expect("save_contact" in tools).toBe(false);
  });

  it("registers only sellerhub tools when sellerhub toolset is selected", () => {
    const tools = getTools(new Set(["sellerhub"]) as never);
    expect("list_sellerhub_domains" in tools).toBe(true);
    expect("create_checkout_link" in tools).toBe(true);
    expect("list_domains" in tools).toBe(false);
  });

  it("does not register duplicate tools when overlapping toolsets are selected", () => {
    const tools = getTools(new Set(["domains", "availability"]) as never);
    // Both toolsets include registerDomainManagementTools — should not duplicate
    const toolNames = Object.keys(tools);
    const unique = new Set(toolNames);
    expect(toolNames.length).toBe(unique.size);
  });
});
