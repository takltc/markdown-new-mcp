#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [, , command, ...args] = process.argv;

if (!command) {
  console.error("Usage: node scripts/smoke-stdio.mjs <command> [...args]");
  process.exit(2);
}

const client = new Client({
  name: "markdown-new-mcp-smoke",
  version: "0.0.0",
});

const transport = new StdioClientTransport({
  command,
  args,
  cwd: process.cwd(),
  stderr: "pipe",
});

let stderr = "";
let connected = false;
transport.stderr?.on("data", (chunk) => {
  stderr += chunk.toString();
});

const timeout = setTimeout(() => {
  console.error(`Timed out connecting to MCP server: ${command} ${args.join(" ")}`);
  if (stderr.trim()) {
    console.error(stderr.trim());
  }
  process.exit(124);
}, 20000);

try {
  await client.connect(transport);
  connected = true;
  const result = await client.listTools();
  console.log(
    JSON.stringify(
      {
        toolCount: result.tools.length,
        toolNames: result.tools.map((tool) => tool.name),
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (stderr.trim()) {
    console.error(stderr.trim());
  }
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  if (connected) {
    await Promise.race([
      client.close().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
}
