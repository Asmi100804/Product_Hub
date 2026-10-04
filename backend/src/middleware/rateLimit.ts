import type { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";

type Bucket = { count: number; resetAt: number };

// Tiny in-memory fixed-window limiter (no extra dependency). Use `check()` from non-HTTP code
// (WebSocket handlers) and `middleware` for Express routes.
export const createRateLimiter = ({ windowMs, max }: { windowMs: number; max: number }) => {
  const buckets = new Map<string, Bucket>();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  }, windowMs);
  cleanup.unref();

  // returns true if the action is allowed
  const check = (key: string) => {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= max;
  };

  const middleware = (req: Request, res: Response, next: NextFunction) => {
    const key = getAuth(req).userId ?? req.ip ?? "anonymous";
    if (!check(key)) {
      res.setHeader("Retry-After", Math.ceil(windowMs / 1000));
      return res.status(429).json({ error: "Too many requests, please slow down" });
    }
    next();
  };

  return { check, middleware };
};

export const messageLimiter = createRateLimiter({ windowMs: 10_000, max: 20 }); // 20 msgs / 10s / user
export const commentLimiter = createRateLimiter({ windowMs: 60_000, max: 20 }); // 20 writes / min / user
export const startConversationLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });
