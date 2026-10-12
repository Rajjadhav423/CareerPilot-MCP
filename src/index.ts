import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CareerPilotApi } from "./careerpilot-api.js";
import { config } from "./config.js";
import { callCareerPilotTool, toolDescriptions, toolSchemas } from "./tools.js";

const server = new McpServer({ name: "careerpilot-mcp", version: "0.1.0" });
const api = new CareerPilotApi();

for (const [name, schema] of Object.entries(toolSchemas) as Array<[keyof typeof toolSchemas, (typeof toolSchemas)[keyof typeof toolSchemas]]>) {
  server.tool(name, toolDescriptions[name], schema.shape, async (args) => {
    try {
      return await callCareerPilotTool(api, name, args);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The operation failed.";
      return { content: [{ type: "text", text: message }], isError: true };
    }
  });
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`CareerPilot MCP started over stdio (API: ${new URL(config.apiBaseUrl).origin}).`);
}

main().catch((error: unknown) => {
  console.error("CareerPilot MCP could not start:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
