import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpaceshipClient } from "./spaceship-client.js";
import { registerDnsRecordTools } from "./tools/dns-records.js";
import { registerDnsRecordCreatorTools } from "./tools/dns-record-creators.js";
import { registerDomainManagementTools } from "./tools/domain-management.js";
import { registerDomainLifecycleTools } from "./tools/domain-lifecycle.js";
import { registerContactsPrivacyTools } from "./tools/contacts-privacy.js";
import { registerSellerHubTools } from "./tools/sellerhub.js";
import { registerPersonalNameserverTools } from "./tools/personal-nameservers.js";
import { registerAnalysisTools } from "./tools/analysis.js";

interface ToolEntry {
  name: string;
  title?: string;
  description: string;
  inputSchema: unknown;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

type RegisteredTool = {
  title?: string;
  description: string;
  inputSchema?: unknown;
  handler: (args: Record<string, unknown>, extra: unknown) => Promise<unknown>;
};

type ServerWithTools = {
  _registeredTools: Record<string, RegisteredTool>;
};

const collectTools = (server: McpServer, client: SpaceshipClient): ToolEntry[] => {
  // Register all tools, then collect their metadata
  registerDnsRecordTools(server, client);
  registerDnsRecordCreatorTools(server, client);
  registerDomainManagementTools(server, client);
  registerDomainLifecycleTools(server, client);
  registerContactsPrivacyTools(server, client);
  registerSellerHubTools(server, client);
  registerPersonalNameserverTools(server, client);
  registerAnalysisTools(server, client);

  const internal = server as unknown as ServerWithTools;
  const entries: ToolEntry[] = [];

  for (const [name, tool] of Object.entries(internal._registeredTools)) {
    entries.push({
      name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      handler: (args) => tool.handler(args, {}),
    });
  }

  return entries;
};

export const registerDynamicTools = (server: McpServer, client: SpaceshipClient): void => {
  const catalog = collectTools(server, client);

  // Remove all static tools — we'll replace with meta-tools
  const internal = server as unknown as ServerWithTools;
  for (const name of Object.keys(internal._registeredTools)) {
    delete internal._registeredTools[name];
  }

  server.registerTool(
    "search_tools",
    {
      title: "Search Tools",
      description:
        "Search available Spaceship tools by keyword. Returns matching tool names and descriptions. " +
        "Use this first to discover which tools are available for your task.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        query: z.string().describe("Search keyword to match against tool names and descriptions."),
      }),
    },
    async ({ query }) => {
      const q = query.toLowerCase();
      const matches = catalog.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          (t.title?.toLowerCase().includes(q) ?? false),
      );

      if (matches.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No tools found matching "${query}".` }],
        };
      }

      const lines = matches.map((t) => `- **${t.name}**: ${t.description}`);
      return {
        content: [{
          type: "text" as const,
          text: `Found ${matches.length} tool(s):\n${lines.join("\n")}`,
        }],
      };
    },
  );

  server.registerTool(
    "describe_tools",
    {
      title: "Describe Tools",
      description:
        "Get the full parameter schema for one or more tools. " +
        "Call this after search_tools to understand required parameters before executing.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        tools: z.array(z.string()).min(1).describe("Tool names to describe."),
      }),
    },
    async ({ tools: toolNames }) => {
      const results: string[] = [];

      for (const name of toolNames) {
        const tool = catalog.find((t) => t.name === name);
        if (!tool) {
          results.push(`**${name}**: not found`);
          continue;
        }

        const schemaJson = JSON.stringify(z.toJSONSchema(tool.inputSchema as z.ZodType), null, 2);

        results.push(
          `**${tool.name}**${tool.title ? ` (${tool.title})` : ""}\n` +
          `${tool.description}\n` +
          `Parameters:\n\`\`\`json\n${schemaJson}\n\`\`\``,
        );
      }

      return {
        content: [{ type: "text" as const, text: results.join("\n\n---\n\n") }],
      };
    },
  );

  server.registerTool(
    "execute_tool",
    {
      title: "Execute Tool",
      description:
        "Execute a Spaceship tool by name with the given arguments. " +
        "Use describe_tools first to understand the required parameters.",
      annotations: { readOnlyHint: false, openWorldHint: true },
      inputSchema: z.object({
        tool: z.string().describe("The tool name to execute."),
        arguments: z.record(z.string(), z.unknown()).default({}).describe("Arguments to pass to the tool."),
      }),
    },
    async ({ tool: toolName, arguments: args }) => {
      const tool = catalog.find((t) => t.name === toolName);
      if (!tool) {
        return {
          content: [{
            type: "text" as const,
            text: `Tool "${toolName}" not found. Use search_tools to find available tools.`,
          }],
          isError: true,
        };
      }

      try {
        return await tool.handler(args) as { content: Array<{ type: "text"; text: string }> };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Error executing "${toolName}": ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    },
  );
};
