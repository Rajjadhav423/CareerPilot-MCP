import type { NextFunction, Request, RequestHandler, Response } from "express";

/*
 * Request checks in front of the MCP endpoint (MCP transport security):
 * - Host: only the server's own names, which defeats DNS rebinding (a hostile page pointing its domain at us).
 * - Origin: browsers send it; only listed origins may call. Clients outside a browser send none and are let through
 *   to the token check.
 * - Rate limit per user, so one client can't flood the API, Gmail or Drive.
 */

export function hostGuard(allowedHosts: string[]): RequestHandler {
  const allowed = new Set(allowedHosts.map((host) => host.toLowerCase()));
  return (req: Request, res: Response, next: NextFunction) => {
    const host = (req.headers.host ?? "").toLowerCase();
    if (!allowed.has(host)) return res.status(403).json({ error: "Host not allowed." });
    next();
  };
}

export function originGuard(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin !== undefined && !allowed.has(origin)) return res.status(403).json({ error: "Origin not allowed." });
    next();
  };
}

/** Fixed-window limit per key (the user id): at most `limit` requests per `windowMs`. */
export function rateLimit(options: { limit: number; windowMs: number; key: (req: Request) => string | undefined }): RequestHandler {
  const windows = new Map<string, { start: number; count: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = options.key(req);
    if (!key) return next();
    const now = Date.now();
    // Forget finished windows now and then, so the map can't grow without bound
    if (windows.size > 10_000) for (const [k, w] of windows) if (now - w.start >= options.windowMs) windows.delete(k);
    const window = windows.get(key);
    if (!window || now - window.start >= options.windowMs) {
      windows.set(key, { start: now, count: 1 });
      return next();
    }
    if (++window.count > options.limit) {
      res.setHeader("Retry-After", String(Math.ceil((window.start + options.windowMs - now) / 1000)));
      return res.status(429).json({ error: "Too many requests. Try again shortly." });
    }
    next();
  };
}
