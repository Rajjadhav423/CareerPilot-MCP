import { config } from "./config.js";

export class CareerPilotApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "CareerPilotApiError";
  }
}

export class CareerPilotApi {
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//")) {
      throw new Error("API paths must be relative paths beginning with one slash.");
    }

    const base = config.apiBaseUrl.endsWith("/") ? config.apiBaseUrl : `${config.apiBaseUrl}/`;
    const url = new URL(path.slice(1), base);
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (config.apiToken) headers.set("Authorization", `Bearer ${config.apiToken}`);
    if (init.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(15_000),
    });
    const body = await response.text();

    if (!response.ok) {
      throw new CareerPilotApiError(`CareerPilot API returned HTTP ${response.status}.`, response.status);
    }
    if (!body) return undefined as T;

    try {
      return JSON.parse(body) as T;
    } catch {
      throw new Error("CareerPilot API returned an unexpected non-JSON response.");
    }
  }
}
