import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs, { type FileHandle } from "fs/promises";
import path from "path";
import {
  MARKDOWN_NEW_BASE_URL,
  MAX_FILE_SIZE_BYTES,
  SERVER_VERSION,
} from "./config.js";
import {
  buildAuthHeaders,
  fetchWithTimeout,
  toErrorMessage,
  sanitizeErrorMessage,
  extractMarkdown,
} from "./utils.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "markdown-new-mcp",
    version: SERVER_VERSION,
  });

  // ── Tool 1: convert URL to Markdown ─────────────────────────────────────
  server.tool(
    "convert_url_to_markdown",
    "Convert a remote file URL to clean Markdown text. Supports PDF, DOCX, XLSX, images, and 20+ formats.",
    {
      url: z.string().url().describe("HTTP or HTTPS URL of the remote file to convert into Markdown."),
      api_key: z.string().optional().describe("Optional markdown.new API key. Leave empty to use MARKDOWN_NEW_API_KEY from the server environment."),
    },
    { readOnlyHint: true, openWorldHint: true },
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
                text: sanitizeErrorMessage(
                  `Error converting URL: ${response.status} ${response.statusText}\n${errorText}`
                ),
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
              text: sanitizeErrorMessage(`Failed to convert URL to Markdown: ${errorMessage}`),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ── Tool 2: convert local file to Markdown ──────────────────────────────
  server.tool(
    "convert_file_to_markdown",
    "Convert a local file to clean Markdown text. The path must be absolute and visible to the server process. Supports PDF, DOCX, XLSX, images, and 20+ formats.",
    {
      file_path: z.string().describe("Absolute path to a local file visible to this MCP server process."),
      api_key: z.string().optional().describe("Optional markdown.new API key. Leave empty to use MARKDOWN_NEW_API_KEY from the server environment."),
    },
    { readOnlyHint: true, openWorldHint: true },
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
                text: sanitizeErrorMessage(
                  `Error converting file: ${response.status} ${response.statusText}\n${errorText}`
                ),
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
              text: sanitizeErrorMessage(`Failed to convert file to Markdown: ${errorMessage}`),
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

  // ── Tool 3: convert URL to JSON ─────────────────────────────────────────
  server.tool(
    "convert_url_to_json",
    "Convert a remote file URL to structured JSON, including metadata such as title, tokens, and duration. Supports PDF, DOCX, XLSX, images, and 20+ formats.",
    {
      url: z.string().url().describe("HTTP or HTTPS URL of the remote file to convert into a structured JSON response."),
      api_key: z.string().optional().describe("Optional markdown.new API key. Leave empty to use MARKDOWN_NEW_API_KEY from the server environment."),
    },
    { readOnlyHint: true, openWorldHint: true },
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
                text: sanitizeErrorMessage(
                  `Error converting URL: ${response.status} ${response.statusText}\n${errorText}`
                ),
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
              text: sanitizeErrorMessage(`Failed to convert URL to JSON: ${errorMessage}`),
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

export function createSandboxServer() {
  return createServer().server;
}

export default function createSmitheryServer() {
  return createServer().server;
}
