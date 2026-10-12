const apiUrl = process.env.CAREERPILOT_API_URL?.trim();

if (!apiUrl) {
  throw new Error("CAREERPILOT_API_URL is required. Copy .env.example to .env and configure it.");
}

let parsedUrl: URL;
try {
  parsedUrl = new URL(apiUrl);
} catch {
  throw new Error("CAREERPILOT_API_URL must be a valid absolute URL.");
}

if (!["http:", "https:"].includes(parsedUrl.protocol)) {
  throw new Error("CAREERPILOT_API_URL must use HTTP or HTTPS.");
}

export const config = {
  apiBaseUrl: parsedUrl.toString().replace(/\/$/, ""),
  apiToken: process.env.CAREERPILOT_API_TOKEN?.trim() || undefined,
};
