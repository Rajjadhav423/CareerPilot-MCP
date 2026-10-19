import { createHmac } from "node:crypto";
import { request } from "node:http";
import express from "express";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import { hostGuard, originGuard, rateLimit } from "./http-guard.js";
import { SERVICE_TOKEN_AUDIENCE, SERVICE_TOKEN_ISSUER, signServiceToken } from "./service-token.js";

async function call(app: express.Express, headers: Record<string, string>) {
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  try {
    // node:http, because fetch won't let a caller set Host
    return await new Promise<number>((resolve, reject) => {
      request({ host: "127.0.0.1", port, path: "/", headers: { Host: `127.0.0.1:${port}`, ...headers } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      }).on("error", reject).end();
    });
  } finally {
    server.close();
  }
}

function appWith(...guards: express.RequestHandler[]) {
  const app = express();
  app.use(...guards);
  app.get("/", (_req, res) => { res.send("ok"); });
  return app;
}

describe("transport guards", () => {
  it("rejects a Host it doesn't serve (DNS rebinding)", async () => {
    const app = appWith(hostGuard(["mcp.example.com"]));
    expect(await call(app, { Host: "mcp.example.com" })).toBe(200);
    expect(await call(app, { Host: "attacker.example" })).toBe(403);
  });

  it("rejects browser calls from unlisted origins but lets non-browser clients through", async () => {
    const app = appWith(originGuard(["https://app.example.com"]));
    expect(await call(app, { Origin: "https://app.example.com" })).toBe(200);
    expect(await call(app, { Origin: "https://evil.example" })).toBe(403);
    expect(await call(app, {})).toBe(200);
  });

  it("limits requests per user", async () => {
    const app = appWith(rateLimit({ limit: 2, windowMs: 60_000, key: (req) => req.headers["x-user"] as string }));
    expect(await call(app, { "X-User": "a" })).toBe(200);
    expect(await call(app, { "X-User": "a" })).toBe(200);
    expect(await call(app, { "X-User": "a" })).toBe(429);
    expect(await call(app, { "X-User": "b" })).toBe(200);
  });
});

describe("service token", () => {
  it("is a one-minute HS256 token for the API naming the user", () => {
    const token = signServiceToken("s".repeat(40), "user_123", 1_000_000_000_000);
    const [header, payload, signature] = token.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "HS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toEqual({
      iss: SERVICE_TOKEN_ISSUER, aud: SERVICE_TOKEN_AUDIENCE, sub: "user_123", iat: 1_000_000_000, exp: 1_000_000_060,
    });
    expect(signature).toBe(createHmac("sha256", "s".repeat(40)).update(`${header}.${payload}`).digest("base64url"));
  });
});

describe("config", () => {
  const http = { CLERK_PUBLISHABLE_KEY: "pk", CLERK_SECRET_KEY: "sk", MCP_SERVICE_SECRET: "s".repeat(32) };

  it("requires the service secret for HTTP", () => {
    expect(() => loadConfig({ CLERK_PUBLISHABLE_KEY: "pk", CLERK_SECRET_KEY: "sk" })).toThrow(/MCP_SERVICE_SECRET/);
  });

  it("requires https for a public address and allows only its host", () => {
    expect(() => loadConfig({ ...http, MCP_PUBLIC_URL: "http://mcp.example.com" })).toThrow(/https/);
    expect(loadConfig({ ...http, MCP_PUBLIC_URL: "https://mcp.example.com/" })).toMatchObject({
      publicUrl: "https://mcp.example.com", allowedHosts: ["mcp.example.com"],
    });
  });

  it("allows the loopback names locally", () => {
    expect(loadConfig({ ...http, PORT: "3001" }).allowedHosts).toEqual(["localhost:3001", "127.0.0.1:3001", "[::1]:3001"]);
  });
});
