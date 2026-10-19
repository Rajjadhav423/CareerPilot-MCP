import "dotenv/config";
import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  CAREERPILOT_BACKEND_URL: z.string().url().default("http://localhost:8080"),
  /** The public address clients use, e.g. https://mcp.example.com. The OAuth resource and allowed Host come from it. */
  MCP_PUBLIC_URL: z.string().url().optional(),
  /** Shared with the API only (its MCP_SERVICE_SECRET): signs the server's own calls to the API. */
  MCP_SERVICE_SECRET: z.string().min(32, "MCP_SERVICE_SECRET must be at least 32 characters").optional(),
  CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  MCP_CORS_ORIGINS: z.string().default("http://localhost:3000"),
  BACKEND_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  /** Requests per user per minute */
  MCP_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
  MCP_TRANSPORT: z.enum(["http", "stdio"]).default("http"),
  CAREERPILOT_STDIO_TOKEN: z.string().min(1).optional(),
});

export type Config = {
  port: number;
  backendUrl: string;
  /** Canonical address without a trailing slash, e.g. https://mcp.example.com */
  publicUrl: string;
  /** Host header values accepted (DNS-rebinding protection) */
  allowedHosts: string[];
  serviceSecret?: string;
  clerkPublishableKey?: string;
  clerkSecretKey?: string;
  corsOrigins: string[];
  backendTimeoutMs: number;
  rateLimitPerMinute: number;
  transport: "http" | "stdio";
  stdioToken?: string;
};

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Treat blank values (e.g. `KEY=` in .env) as unset so optional fields don't fail min(1).
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, value]) => value?.trim()));
  const parsed = configSchema.parse(cleaned);
  if (parsed.MCP_TRANSPORT === "http") {
    const missing = (["CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "MCP_SERVICE_SECRET"] as const).filter((key) => !parsed[key]);
    if (missing.length > 0) throw new Error(`${missing.join(", ")} required for HTTP transport.`);
  }
  if (parsed.MCP_TRANSPORT === "stdio" && !parsed.CAREERPILOT_STDIO_TOKEN) {
    throw new Error("CAREERPILOT_STDIO_TOKEN is required for stdio transport.");
  }

  const publicUrl = new URL(parsed.MCP_PUBLIC_URL ?? `http://localhost:${parsed.PORT}`);
  if (publicUrl.protocol !== "https:" && !LOOPBACK.has(publicUrl.hostname)) {
    throw new Error("MCP_PUBLIC_URL must use https:// (http:// only for localhost).");
  }
  // Locally, the same server is reached as localhost or 127.0.0.1
  const allowedHosts = LOOPBACK.has(publicUrl.hostname)
    ? [...LOOPBACK].map((host) => `${host}:${parsed.PORT}`).concat(publicUrl.host)
    : [publicUrl.host];

  return {
    port: parsed.PORT,
    backendUrl: parsed.CAREERPILOT_BACKEND_URL.replace(/\/+$/, ""),
    publicUrl: publicUrl.origin,
    allowedHosts: [...new Set(allowedHosts)],
    serviceSecret: parsed.MCP_SERVICE_SECRET,
    clerkPublishableKey: parsed.CLERK_PUBLISHABLE_KEY,
    clerkSecretKey: parsed.CLERK_SECRET_KEY,
    corsOrigins: parsed.MCP_CORS_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean),
    backendTimeoutMs: parsed.BACKEND_TIMEOUT_MS,
    rateLimitPerMinute: parsed.MCP_RATE_LIMIT_PER_MINUTE,
    transport: parsed.MCP_TRANSPORT,
    stdioToken: parsed.CAREERPILOT_STDIO_TOKEN,
  };
}
