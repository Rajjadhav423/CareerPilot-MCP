import { clerkMiddleware, getAuth } from "@clerk/express";
import { authServerMetadataHandlerClerk } from "@clerk/mcp-tools/express";
import { generateClerkProtectedResourceMetadata, verifyClerkToken } from "@clerk/mcp-tools/server";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createBackendClient } from "./backend.js";
import { loadConfig } from "./config.js";
import { hostGuard, originGuard, rateLimit } from "./http-guard.js";
import { signServiceToken } from "./service-token.js";
import { registerTools, type ToolContext } from "./tools.js";

const config = loadConfig();
const SCOPES = ["profile", "email"];

function createMcpServer(context: ToolContext) {
  const server = new McpServer({ name: "careerpilot", version: "0.1.0" });
  registerTools(server, context);
  return server;
}

if (config.transport === "stdio") {
  // Local development only: the token comes from this machine's environment, as MCP recommends for stdio
  const backend = createBackendClient(config.backendUrl, config.backendTimeoutMs, config.stdioToken!);
  await createMcpServer({ backend, principal: "stdio" }).connect(new StdioServerTransport());
} else {
  const resourceUrl = `${config.publicUrl}/mcp`;
  const metadataUrl = `${config.publicUrl}/.well-known/oauth-protected-resource/mcp`;
  const challenge = `Bearer resource_metadata="${metadataUrl}", scope="${SCOPES.join(" ")}"`;

  const app = express();
  app.disable("x-powered-by");
  // Behind one proxy (the host's load balancer); URLs come from MCP_PUBLIC_URL, never from request headers
  app.set("trust proxy", 1);
  // Liveness for the host's health checks, which may use an internal address: no data, before the Host check
  app.get("/healthz", (_req, res) => { res.json({ ok: true }); });
  app.use(hostGuard(config.allowedHosts));
  app.use((_req, res, next) => {
    res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" });
    next();
  });

  // OAuth discovery is public and read-only (RFC 9728 / RFC 8414)
  app.get("/.well-known/oauth-protected-resource/mcp", cors(), (_req, res) => {
    res.json(generateClerkProtectedResourceMetadata({
      publishableKey: config.clerkPublishableKey!, resourceUrl, properties: { scopes_supported: SCOPES },
    }));
  });
  app.get("/.well-known/oauth-authorization-server", cors(), authServerMetadataHandlerClerk);

  const mcp = express.Router();
  mcp.use(originGuard(config.corsOrigins));
  mcp.use(cors({ origin: config.corsOrigins, exposedHeaders: ["WWW-Authenticate"] }));
  mcp.use(clerkMiddleware());
  mcp.use(express.json({ limit: "512kb" }));

  /** Only Clerk OAuth access tokens for this instance; the user id comes from the verified token. */
  mcp.use(async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9._~+/=-]+)$/)?.[1];
    const unauthorized = (description?: string) => res.status(401)
      .set("WWW-Authenticate", description ? `${challenge}, error="invalid_token", error_description="${description}"` : challenge)
      .json({ error: "Authentication required." });
    if (!token) return unauthorized();
    try {
      const auth = verifyClerkToken(getAuth(req, { acceptsToken: "oauth_token" }), token);
      const userId = auth?.extra?.userId;
      if (typeof userId !== "string" || !userId) return unauthorized("The access token is invalid or expired");
      res.locals.userId = userId;
      next();
    } catch {
      return unauthorized("The access token is invalid or expired");
    }
  });
  mcp.use(rateLimit({ limit: config.rateLimitPerMinute, windowMs: 60_000, key: (req) => req.res?.locals.userId }));

  mcp.post("/", async (req: Request, res: Response) => {
    const userId = res.locals.userId as string;
    // Our own short-lived token for the API, never the user's: MCP forbids token passthrough
    const backend = createBackendClient(config.backendUrl, config.backendTimeoutMs, () => signServiceToken(config.serviceSecret!, userId));
    const server = createMcpServer({ backend, principal: userId });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { void transport.close(); void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) res.status(500).json({ error: "Internal error." });
    }
  });
  // Stateless server: no server-initiated streams or sessions
  mcp.all("/", (_req, res) => { res.status(405).set("Allow", "POST").json({ error: "Method not allowed." }); });
  app.use("/mcp", mcp);

  app.use((_req, res) => { res.status(404).json({ error: "Not found." }); });
  app.listen(config.port, () => console.info(`CareerPilot MCP listening on port ${config.port} as ${config.publicUrl}`));
}
