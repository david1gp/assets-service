import type { Hono } from "hono"

export type ApiApplication = Hono<{ Variables: Record<string, unknown> }>
