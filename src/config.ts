import "dotenv/config";
import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  CAREERPILOT_BACKEND_URL: z.string().url().default("http://localhost:8080"),
  CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  MCP_CORS_ORIGINS: z.string().default("http://localhost:3000"),
  BACKEND_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  MCP_TRANSPORT: z.enum(["http", "stdio"]).default("http"),
  CAREERPILOT_STDIO_TOKEN: z.string().min(1).optional(),
});

export type Config = {
  port: number;
  backendUrl: string;
  clerkPublishableKey?: string;
  clerkSecretKey?: string;
  corsOrigins: string[];
  backendTimeoutMs: number;
  transport: "http" | "stdio";
  stdioToken?: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Treat blank values (e.g. `KEY=` in .env) as unset so optional fields don't fail min(1).
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, value]) => value?.trim()));
  const parsed = configSchema.parse(cleaned);
  if (parsed.MCP_TRANSPORT === "http" && (!parsed.CLERK_PUBLISHABLE_KEY || !parsed.CLERK_SECRET_KEY)) {
    throw new Error("CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are required for HTTP transport.");
  }
  if (parsed.MCP_TRANSPORT === "stdio" && !parsed.CAREERPILOT_STDIO_TOKEN) {
    throw new Error("CAREERPILOT_STDIO_TOKEN is required for stdio transport.");
  }
  return {
    port: parsed.PORT,
    backendUrl: parsed.CAREERPILOT_BACKEND_URL.replace(/\/+$/, ""),
    clerkPublishableKey: parsed.CLERK_PUBLISHABLE_KEY,
    clerkSecretKey: parsed.CLERK_SECRET_KEY,
    corsOrigins: parsed.MCP_CORS_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean),
    backendTimeoutMs: parsed.BACKEND_TIMEOUT_MS,
    transport: parsed.MCP_TRANSPORT,
    stdioToken: parsed.CAREERPILOT_STDIO_TOKEN,
  };
}
