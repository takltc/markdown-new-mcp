#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { statSync } from "fs";

const MARKDOWN_NEW_BASE_URL = "https://markdown.new";

interface MarkdownResponse {
  markdown?: string;
  content?: string;
  title?: string;
  tokens?: number;
  duration?: number;
  [key: string]: unknown;
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
  }
  return JSON.stringify(data, null, 2);
}

const server = new McpServer({
  name: "markdown-new-mcp",
  version: "1.0.0",
});

/**
 * Convert a remote file URL to Markdown
 * Uses POST / endpoint for better reliability
 */
server.tool(
  "convert_url_to_markdown",
  "Convert a remote file URL to Markdown. Supports PDF, DOCX, XLSX, images and 20+ formats. Maximum file size: 10MB.",
  {
    url: z.string().url().describe("The URL of the remote file to convert"),
    api_key: z.string().optional().describe("Optional API key for higher rate limits (format: mk_...)"),
  },
  async ({ url, api_key }) => {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (api_key) {
        headers["Authorization"] = `Bearer ${api_key}`;
      }

      const response = await fetch(MARKDOWN_NEW_BASE_URL, {
        method: "POST",
        headers,
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
      const errorMessage = error instanceof Error ? error.message : String(error);
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

/**
 * Convert a local file to Markdown
 * Uses POST /convert endpoint to upload file
 */
server.tool(
  "convert_file_to_markdown",
  "Convert a local file to Markdown. Supports PDF, DOCX, XLSX, images and 20+ formats. Maximum file size: 10MB.",
  {
    file_path: z.string().describe("The absolute path to the local file to convert"),
    api_key: z.string().optional().describe("Optional API key for higher rate limits (format: mk_...)"),
  },
  async ({ file_path, api_key }) => {
    try {
      // Validate file exists and get stats
      let fileStats;
      try {
        fileStats = statSync(file_path);
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

      // Check file size (10MB limit)
      const MAX_FILE_SIZE = 10 * 1024 * 1024;
      if (fileStats.size > MAX_FILE_SIZE) {
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

      // Read file content
      const fileContent = await fs.readFile(file_path);
      const fileName = path.basename(file_path);

      // Create form data
      const formData = new FormData();
      const blob = new Blob([fileContent]);
      formData.append("file", blob, fileName);

      const headers: Record<string, string> = {};

      if (api_key) {
        headers["Authorization"] = `Bearer ${api_key}`;
      }

      const response = await fetch(`${MARKDOWN_NEW_BASE_URL}/convert`, {
        method: "POST",
        headers,
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to convert file to Markdown: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * Convert a remote file URL to JSON with metadata
 * Uses GET /:file-url?format=json endpoint
 */
server.tool(
  "convert_url_to_json",
  "Convert a remote file URL to JSON with metadata (title, tokens, duration, etc). Supports PDF, DOCX, XLSX, images and 20+ formats.",
  {
    url: z.string().url().describe("The URL of the remote file to convert"),
    api_key: z.string().optional().describe("Optional API key for higher rate limits (format: mk_...)"),
  },
  async ({ url, api_key }) => {
    try {
      // Build the URL for the GET endpoint
      // Format: https://markdown.new/:file-url?format=json
      const encodedUrl = encodeURIComponent(url);
      const requestUrl = `${MARKDOWN_NEW_BASE_URL}/${encodedUrl}?format=json`;

      const headers: Record<string, string> = {};

      if (api_key) {
        headers["Authorization"] = `Bearer ${api_key}`;
      }

      const response = await fetch(requestUrl, {
        method: "GET",
        headers,
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
      const errorMessage = error instanceof Error ? error.message : String(error);
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

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
