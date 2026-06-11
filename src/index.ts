#!/usr/bin/env node

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import http from "http";
import { createServer } from "./server.js";

async function runStdio() {
  const server = createServer();
  const transport = new StdioServerTransport();

  const cleanup = async () => {
    try {
      await server.close();
    } catch {
      // ignore
    }
    process.exit(0);
  };

  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);

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

    // Handle CORS preflight for SSE endpoints
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, Last-Event-ID",
        "Access-Control-Max-Age": "86400",
      });
      res.end();
      return;
    }

    // Add CORS headers to all responses
    const setCors = () => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, Last-Event-ID");
    };

    if (req.method === "GET" && pathname === "/health") {
      setCors();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "markdown-new-mcp" }));
      return;
    }

    if (req.method === "GET" && pathname === "/sse") {
      setCors();
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
      setCors();
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

  const cleanup = async () => {
    console.log("\nShutting down SSE server...");

    // Close all active MCP server connections
    const closePromises = Array.from(servers.values()).map((srv) =>
      srv.close().catch(() => undefined)
    );
    await Promise.all(closePromises);
    servers.clear();
    transports.clear();

    httpServer.close(() => {
      process.exit(0);
    });

    // Force exit if graceful close takes too long
    setTimeout(() => process.exit(1), 5000);
  };

  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);

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
