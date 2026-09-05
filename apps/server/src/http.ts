import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApiError } from "../../../packages/api-contract/src/index.ts";
export class HttpError extends Error {
  constructor(readonly status: number, readonly code: ApiError["code"], message: string, readonly retryable = false) { super(message); }
}
export function json(response: ServerResponse, status: number, body: unknown): void {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}
export async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new HttpError(400, "INVALID_REQUEST", "Request body is too large");
  }
  const value: unknown = body ? JSON.parse(body) : {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "INVALID_REQUEST", "JSON body must be an object");
  return value as Record<string, unknown>;
}
