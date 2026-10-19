import { clerkMiddleware } from "@clerk/express";
import { authServerMetadataHandlerClerk, mcpAuthClerk, protectedResourceHandlerClerk, streamableHttpHandler } from "@clerk/mcp-tools/express";
import cors from "cors";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createBackendClient } from "./backend.js";
import { loadConfig } from "./config.js";
import { registerTools } from "./tools.js";

const config = loadConfig();

function createMcpServer(token: string) {
  const server = new McpServer({ name: "careerpilot", version: "0.1.0" });
  registerTools(server, { backend: createBackendClient(config.backendUrl, config.backendTimeoutMs, token), userToken: token });
  return server;
}

if (config.transport === "stdio") {
  await createMcpServer(config.stdioToken!).connect(new StdioServerTransport());
} else {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: config.corsOrigins, exposedHeaders: ["WWW-Authenticate"] }));
  app.use(clerkMiddleware());
  app.use(express.json({ limit: "512kb" }));
  app.get("/.well-known/oauth-protected-resource/mcp", protectedResourceHandlerClerk({ scopes_supported: ["profile", "email"] }));
  app.get("/.well-known/oauth-authorization-server", authServerMetadataHandlerClerk);
  app.post("/mcp", mcpAuthClerk, (req, res) => {
    const token = req.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return res.status(401).json({ error: "Authentication required." });
    return streamableHttpHandler(createMcpServer(token))(req, res);
  });
  app.listen(config.port, () => console.info(`CareerPilot MCP listening on port ${config.port}`));
}
