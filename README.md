# CareerPilot MCP

A standalone Model Context Protocol server built with TypeScript, Node.js, and the official MCP TypeScript SDK. It exposes selected CareerPilot workflows to MCP clients and calls the existing REST API rather than duplicating backend business logic.

## Requirements

- Node.js 20 or newer
- npm
- A running CareerPilot API and credentials accepted by that API

## Setup

```bash
npm install
cp .env.example .env
```

Set `CAREERPILOT_API_URL` to the deployed CareerPilot API base URL, including `/api/v1` if required. Configure authentication accepted by your backend.

```bash
npm run typecheck
npm test
npm run build
npm start
```

Use `npm run dev` during development. MCP messages use standard input/output; diagnostics go to standard error.

## Tools

- `careerpilot_api_status` — basic API reachability check.
- `get_resume_schema` — retrieve the resume data schema.
- `get_resume_templates` — list available templates.
- `list_my_resumes` — list resumes for the authenticated user.
- `create_resume_draft` — create a resume draft.
- `preview_resume` — request a preview without saving.

## Security

- Never commit `.env`, access tokens, or user data.
- `CAREERPILOT_API_TOKEN` is intended only for local development. A shared token is not a safe multi-user authentication strategy.
- Production must validate each connecting user's identity and forward an appropriately scoped credential to CareerPilot. Never use a shared service token to impersonate users.
- API error bodies are not forwarded, reducing the risk of leaking private backend details.
- Users should review resume drafts before using them.

## API route mapping

The route paths in `src/tools.ts` are initial mappings. Verify them against the deployed CareerPilot API before use and adjust the paths to match existing endpoints rather than reimplementing business logic.

## Transport

This first version uses MCP stdio transport for local MCP clients. Remote hosting requires authenticated HTTP transport and per-user credential handling. Do not expose the stdio process directly to the internet.
