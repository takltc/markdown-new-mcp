import { REQUEST_TIMEOUT_MS } from "./config.js";
import type { MarkdownResponse } from "./types.js";

export function resolveApiKey(explicitApiKey?: string): string | undefined {
  const apiKey = explicitApiKey?.trim() || process.env.MARKDOWN_NEW_API_KEY?.trim();
  return apiKey ? apiKey : undefined;
}

export function buildAuthHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const resolvedApiKey = resolveApiKey(apiKey);
  if (resolvedApiKey) {
    headers["Authorization"] = `Bearer ${resolvedApiKey}`;
  }
  return headers;
}

export function fetchWithTimeout(input: string | URL, init: RequestInit): Promise<Response> {
  // Use AbortSignal.timeout when available (Node.js 20.14.0+, better memory management).
  // Fallback to manual AbortController for older Node.js versions.
  if (typeof AbortSignal.timeout === "function") {
    return fetch(input, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  return fetch(input, {
    ...init,
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timeout);
  });
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") {
    return `Request timed out after ${REQUEST_TIMEOUT_MS}ms`;
  }
  return error instanceof Error ? error.message : String(error);
}

export function sanitizeErrorMessage(message: string): string {
  // Redact potential API keys from error messages before sending to client.
  return message
    .replace(/\bBearer\s+[a-zA-Z0-9_-]{10,}\b/g, "Bearer [REDACTED]")
    .replace(/\bmk_[a-zA-Z0-9_-]+\b/g, "[REDACTED]");
}

export function extractMarkdown(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }

  if (typeof data === "object" && data !== null) {
    const obj = data as MarkdownResponse;
    if (typeof obj.markdown === "string") {
      return obj.markdown;
    }
    if (typeof obj.content === "string") {
      return obj.content;
    }
    if (obj.data && typeof obj.data === "object") {
      if (typeof obj.data.markdown === "string") {
        return obj.data.markdown;
      }
      if (typeof obj.data.content === "string") {
        return obj.data.content;
      }
    }
    if (obj.success === false && typeof obj.error === "string") {
      return `Conversion failed: ${obj.error}`;
    }
  }

  return JSON.stringify(data, null, 2);
}
