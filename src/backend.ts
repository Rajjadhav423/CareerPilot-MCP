export class BackendError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** The backend's error detail plus any field errors, so the assistant can see what to fix. */
export function problemMessage(value: unknown, status: number): string {
  const problem = typeof value === "object" && value !== null ? value as { detail?: unknown; errors?: unknown } : {};
  const detail = typeof problem.detail === "string" ? problem.detail : `Backend request failed with status ${status}.`;
  // errors: { "data.basics.email": "must be an email address", … }
  const errors = typeof problem.errors === "object" && problem.errors !== null
    ? Object.entries(problem.errors).slice(0, 10).map(([field, message]) => `${field}: ${String(message)}`)
    : [];
  return errors.length > 0 ? `${detail}\n- ${errors.join("\n- ")}` : detail;
}

export type BackendClient = {
  request<T>(path: string, init?: RequestInit): Promise<T>;
};

/** `token`: the bearer for each call; a function is called per request (e.g. a fresh short-lived service token). */
export function createBackendClient(baseUrl: string, timeoutMs: number, token: string | (() => string)): BackendClient {
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
            Authorization: `Bearer ${typeof token === "function" ? token() : token}`,
            ...(init.headers ?? {}),
          },
        });
        const contentType = response.headers.get("content-type") ?? "";
        // Errors come as application/problem+json: { detail, errors?: [{ field, message }] }
        const value = /[/+]json\b/.test(contentType) ? await response.json() : await response.text();
        if (!response.ok) throw new BackendError(response.status, problemMessage(value, response.status));
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
