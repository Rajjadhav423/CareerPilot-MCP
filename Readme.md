# CareerPilot MCP server

This server exposes CareerPilot's existing authenticated API to MCP clients such as Claude and Cursor. It does not connect to PostgreSQL, implement a second resume engine, or store CareerPilot data.

## Architecture and security

The remote endpoint uses Clerk's supported Express MCP utilities and Streamable HTTP:

1. Clerk validates the MCP OAuth bearer token.
2. The server forwards that same user-scoped bearer token to CareerPilot.
3. CareerPilot independently verifies the Clerk token and scopes every query by its authenticated user.
4. MCP tools validate their inputs before making backend calls.

The server never accepts a user id as an authorization mechanism and never returns credentials. Email sending is a two-step flow: `prepare_application_email` creates a short-lived approval binding, then `send_application_email` requires the exact approved recipient, subject, body, and attachment selection. The backend also requires `confirmed: true`.

## Prerequisites

- Node.js 22.18 or later
- A running CareerPilot backend
- Clerk OAuth application with Dynamic client registration enabled

## Local setup

```powershell
Copy-Item .env.example .env
npm install
npm run build
npm test
```

Set `CAREERPILOT_BACKEND_URL`, `CLERK_PUBLISHABLE_KEY`, and `CLERK_SECRET_KEY`. Set `MCP_CORS_ORIGINS` to only the origins that need browser access. The backend's Clerk issuer and authorized-party configuration must accept the token used for the MCP client; do not weaken backend verification.

Run remote HTTP mode:

```powershell
npm run dev
```

Connect a compatible client with:

```json
{
  "mcpServers": {
    "careerpilot": { "url": "http://localhost:3001/mcp" }
  }
}
```

The OAuth metadata endpoints are `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-authorization-server`. Use HTTPS in any shared or production environment.

## Local stdio mode

For development or tests, set `MCP_TRANSPORT=stdio` and provide `CAREERPILOT_STDIO_TOKEN` as a real, user-scoped Clerk session token. This is intentionally an explicit local-user workflow, not a shared service credential:

```powershell
$env:MCP_TRANSPORT = "stdio"
$env:CAREERPILOT_STDIO_TOKEN = "<your user token>"
npm run dev
```

## Tools

Resume tools use the backend's schema, templates, ownership checks, and renderers. Job tools use the backend's duplicate detection and status rules. Email tools use the user's existing Gmail integration; a successful send means only that Gmail accepted the request, not that delivery or reading occurred.

`tailor_resume_for_job` returns an owned resume plus grounding constraints for the AI to prepare a proposal. It does not invent facts or save changes.

## Verification and limitations

`npm run build` checks TypeScript. `npm test` runs the local test suite when tests are added. Live Clerk OAuth, backend access, PDF rendering, Drive, and Gmail require configured services and are not claimed to work until exercised with non-production credentials. No deployment or production-data operation is performed by this repository.
