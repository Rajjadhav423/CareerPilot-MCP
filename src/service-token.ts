import { createHmac } from "node:crypto";

/*
 * The MCP server never forwards the user's OAuth token (MCP forbids token passthrough). After verifying it, the server
 * calls the CareerPilot API with its own token: HS256, signed with a secret shared only with the API, naming the
 * Clerk user, for the API's audience only, valid for one minute. Matches the API's auth/service-token.ts.
 */

export const SERVICE_TOKEN_ISSUER = "careerpilot-mcp";
export const SERVICE_TOKEN_AUDIENCE = "careerpilot-api";
const LIFETIME_SECONDS = 60;

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

export function signServiceToken(secret: string, clerkUserId: string, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: SERVICE_TOKEN_ISSUER, aud: SERVICE_TOKEN_AUDIENCE, sub: clerkUserId, iat, exp: iat + LIFETIME_SECONDS,
  }));
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
