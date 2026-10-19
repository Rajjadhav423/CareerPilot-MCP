export class BackendError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export type BackendClient = {
  request<T>(path: string, init?: RequestInit): Promise<T>;
};

export function createBackendClient(baseUrl: string, timeoutMs: number, token: string): BackendClient {
  return {
    async request<T>(path: string, init: RequestInit = {}) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${baseUrl}/api/v1${path}`, {
          ...init,
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(init.headers ?? {}),
          },
        });
        const contentType = response.headers.get("content-type") ?? "";
        const value = contentType.includes("application/json") ? await response.json() : await response.text();
        if (!response.ok) {
          const detail = typeof value === "object" && value !== null && "detail" in value
            ? String((value as { detail: unknown }).detail)
            : `Backend request failed with status ${response.status}.`;
          throw new BackendError(response.status, detail);
        }
        return value as T;
      } catch (error) {
        if (error instanceof BackendError) throw error;
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new BackendError(504, "CareerPilot backend request timed out.");
        }
        throw new BackendError(502, "CareerPilot backend is unavailable.");
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
