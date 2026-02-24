#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import fs, { type FileHandle } from "fs/promises";
import path from "path";
import http from "http";

const MARKDOWN_NEW_BASE_URL = "https://markdown.new";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const REQUEST_TIMEOUT_MS = parsePositiveInteger(process.env.MARKDOWN_NEW_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS);

interface MarkdownResponse {
  success?: boolean;
  error?: string;
  markdown?: string;
  content?: string;
  title?: string;
  tokens?: number;
  duration?: number;
  data?: {
    markdown?: string;
    content?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveApiKey(explicitApiKey?: string): string | undefined {
  const apiKey = explicitApiKey?.trim() || process.env.MARKDOWN_NEW_API_KEY?.trim();
  return apiKey ? apiKey : undefined;
}

function buildAuthHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const resolvedApiKey = resolveApiKey(apiKey);
  if (resolvedApiKey) {
    headers["Authorization"] = `Bearer ${resolvedApiKey}`;
  }
  return headers;
}

async function fetchWithTimeout(input: string | URL, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") {
    return `Request timed out after ${REQUEST_TIMEOUT_MS}ms`;
  }
  return error instanceof Error ? error.message : String(error);
}

function extractMarkdown(data: unknown): string {
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

function createServer(): McpServer {
  const server = new McpServer({
    name: "markdown-new-mcp",
    version: "1.0.0",
  });

  server.tool(
    "convert_url_to_markdown",
    "Convert a remote file URL to Markdown. Supports PDF, DOCX, XLSX, images and 20+ formats. Maximum file size: 10MB.",
    {
      url: z.string().url().describe("The URL of the remote file to convert"),
      api_key: z.string().optional().describe("Optional API key for higher rate limits (format: mk_..., falls back to MARKDOWN_NEW_API_KEY)"),
    },
    async ({ url, api_key }) => {
      try {
        const response = await fetchWithTimeout(MARKDOWN_NEW_BASE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...buildAuthHeaders(api_key),
          },
          body: JSON.stringify({ url }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return {
            content: [
              {
                type: "text" as const,
                text: `Error converting URL: ${response.status} ${response.statusText}\n${errorText}`,
              },
            ],
            isError: true,
          };
        }

        const data = await response.json();
        const markdown = extractMarkdown(data);

        return {
          content: [
            {
              type: "text" as const,
              text: markdown,
            },
          ],
        };
      } catch (error) {
        const errorMessage = toErrorMessage(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to convert URL to Markdown: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "convert_file_to_markdown",
    "Convert a local file to Markdown. Supports PDF, DOCX, XLSX, images and 20+ formats. Maximum file size: 10MB.",
    {
      file_path: z.string().describe("The absolute path to the local file to convert"),
      api_key: z.string().optional().describe("Optional API key for higher rate limits (format: mk_..., falls back to MARKDOWN_NEW_API_KEY)"),
    },
    async ({ file_path, api_key }) => {
      let fileHandle: FileHandle | undefined;

      try {
        if (!path.isAbsolute(file_path)) {
          return {
            content: [
              {
                type: "text" as const,
                text: `file_path must be an absolute path: ${file_path}`,
              },
            ],
            isError: true,
          };
        }

        try {
          fileHandle = await fs.open(file_path, "r");
        } catch {
          return {
            content: [
              {
                type: "text" as const,
                text: `File not found: ${file_path}`,
              },
            ],
            isError: true,
          };
        }

        const fileStats = await fileHandle.stat();
        if (!fileStats.isFile()) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Path is not a file: ${file_path}`,
              },
            ],
            isError: true,
          };
        }

        if (fileStats.size > MAX_FILE_SIZE_BYTES) {
          return {
            content: [
              {
                type: "text" as const,
                text: `File too large: ${file_path} (${(fileStats.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 10MB.`,
              },
            ],
            isError: true,
          };
        }

        const fileContent = await fileHandle.readFile();
        if (fileContent.length > MAX_FILE_SIZE_BYTES) {
          return {
            content: [
              {
                type: "text" as const,
                text: `File too large after read: ${file_path} (${(fileContent.length / 1024 / 1024).toFixed(2)}MB). Maximum size is 10MB.`,
              },
            ],
            isError: true,
          };
        }

        const fileName = path.basename(file_path);
        const formData = new FormData();
        const blob = new Blob([fileContent]);
        formData.append("file", blob, fileName);

        const response = await fetchWithTimeout(`${MARKDOWN_NEW_BASE_URL}/convert`, {
          method: "POST",
          headers: buildAuthHeaders(api_key),
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          return {
            content: [
              {
                type: "text" as const,
                text: `Error converting file: ${response.status} ${response.statusText}\n${errorText}`,
              },
            ],
            isError: true,
          };
        }

        const data = await response.json();
        const markdown = extractMarkdown(data);

        return {
          content: [
            {
              type: "text" as const,
              text: markdown,
            },
          ],
        };
      } catch (error) {
        const errorMessage = toErrorMessage(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to convert file to Markdown: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      } finally {
        if (fileHandle) {
          await fileHandle.close().catch(() => undefined);
        }
      }
    }
  );

  server.tool(
    "convert_url_to_json",
    "Convert a remote file URL to JSON with metadata (title, tokens, duration, etc). Supports PDF, DOCX, XLSX, images and 20+ formats.",
    {
      url: z.string().url().describe("The URL of the remote file to convert"),
      api_key: z.string().optional().describe("Optional API key for higher rate limits (format: mk_..., falls back to MARKDOWN_NEW_API_KEY)"),
    },
    async ({ url, api_key }) => {
      try {
        const response = await fetchWithTimeout(MARKDOWN_NEW_BASE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...buildAuthHeaders(api_key),
          },
          body: JSON.stringify({ url, format: "json" }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return {
            content: [
              {
                type: "text" as const,
                text: `Error converting URL: ${response.status} ${response.statusText}\n${errorText}`,
              },
            ],
            isError: true,
          };
        }

        const data = await response.json();

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = toErrorMessage(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to convert URL to JSON: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

async function runStdio() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function runSSE(port: number) {
  const transports = new Map<string, SSEServerTransport>();
  const servers = new Map<string, McpServer>();

  const httpServer = http.createServer(async (req, res) => {
    const baseUrl = `http://${req.headers.host ?? "127.0.0.1"}`;
    let requestUrl: URL;

    try {
      requestUrl = new URL(req.url ?? "/", baseUrl);
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Invalid request URL");
      return;
    }

    const pathname = requestUrl.pathname;

    if (req.method === "GET" && pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "markdown-new-mcp" }));
      return;
    }

    if (req.method === "GET" && pathname === "/sse") {
      const server = createServer();
      const transport = new SSEServerTransport("/message", res);
      const sessionId = transport.sessionId;

      transports.set(sessionId, transport);
      servers.set(sessionId, server);

      transport.onclose = () => {
        transports.delete(sessionId);
        servers.delete(sessionId);
      };

      try {
        await server.connect(transport);
      } catch (error) {
        transports.delete(sessionId);
        servers.delete(sessionId);

        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Failed to establish SSE session");
        }

        console.error("Failed to establish SSE session:", error);
      }
      return;
    }

    if (req.method === "POST" && pathname === "/message") {
      const sessionId = requestUrl.searchParams.get("sessionId");
      if (!sessionId) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Missing sessionId");
        return;
      }

      const transport = transports.get(sessionId);
      if (!transport) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Session not found");
        return;
      }

      try {
        await transport.handlePostMessage(req, res);
      } catch (error) {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Failed to handle message");
        }
        console.error("SSE message handling failed:", error);
      }
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  return new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, "0.0.0.0", () => {
      console.log(`MCP SSE Server running on http://0.0.0.0:${port}`);
      console.log(`Health check: http://0.0.0.0:${port}/health`);
      console.log(`SSE endpoint: http://0.0.0.0:${port}/sse`);
      resolve();
    });
  });
}

async function main() {
  const mode = process.env.MCP_TRANSPORT || "stdio";
  const port = parseInt(process.env.MCP_PORT || "38721", 10);

  if (mode === "sse") {
    await runSSE(port);
  } else {
    await runStdio();
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
