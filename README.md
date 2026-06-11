# markdown-new-mcp

MCP (Model Context Protocol) server for [markdown.new](https://markdown.new) file conversion API. Convert PDF, DOCX, XLSX, images and 20+ formats to Markdown.

## Installation

```bash
npm install markdown-new-mcp
```

## Usage

### With Claude Desktop or Claude Code

For stdio MCP clients, use `npx -y` so the server starts under Node.js and preserves the JSON-RPC stdio stream. Add this to your Claude config:

```json
{
  "mcpServers": {
    "markdown-new": {
      "command": "npx",
      "args": ["-y", "markdown-new-mcp@latest"]
    }
  }
}
```

### With opencode

Add this to the `mcp` section of `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "markdown-new": {
      "type": "local",
      "command": ["npx", "-y", "markdown-new-mcp@latest"]
    }
  }
}
```

### With API Key (Optional)

For higher rate limits, you can provide an API key via environment variable:

```json
{
  "mcpServers": {
    "markdown-new": {
      "command": "npx",
      "args": ["-y", "markdown-new-mcp@latest"],
      "env": {
        "MARKDOWN_NEW_API_KEY": "mk_your_api_key_here"
      }
    }
  }
}
```

Optional:
- `MARKDOWN_NEW_TIMEOUT_MS`: request timeout in milliseconds for upstream API calls (default: `30000`)

## Available Tools

### `convert_url_to_markdown`

Convert a remote file URL to clean Markdown text. Supports PDF, DOCX, XLSX, images, and 20+ formats.

**Parameters:**
- `url` (string, required): HTTP or HTTPS URL of the remote file
- `api_key` (string, optional): API key for higher rate limits; the server also reads `MARKDOWN_NEW_API_KEY`

**Example:**
```
Convert this PDF to markdown: https://example.com/document.pdf
```

### `convert_file_to_markdown`

Convert a local file to clean Markdown text. The path must be absolute and visible to the server process. Supports PDF, DOCX, XLSX, images, and 20+ formats.

**Parameters:**
- `file_path` (string, required): The absolute path to the local file
- `api_key` (string, optional): API key for higher rate limits; the server also reads `MARKDOWN_NEW_API_KEY`

**Example:**
```
Convert /path/to/document.pdf to markdown
```

### `convert_url_to_json`

Convert a remote file URL to structured JSON, including metadata such as title, tokens, and duration. Supports PDF, DOCX, XLSX, images, and 20+ formats.

**Parameters:**
- `url` (string, required): The URL of the remote file
- `api_key` (string, optional): API key for higher rate limits; the server also reads `MARKDOWN_NEW_API_KEY`

## Supported Formats

- **Documents:** PDF, DOCX, ODT
- **Spreadsheets:** XLSX, XLS, XLSM, XLSB, ET, ODS, Numbers
- **Images:** JPG, JPEG, PNG, WebP, SVG
- **Text/Data:** TXT, MD, CSV, JSON, XML, HTML, HTM

## Limits

- **Without API Key:** 500 requests/day per IP
- **With API Key:** Higher limits available
- **Maximum File Size:** 10MB

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run locally
npm run dev

# Smoke test the stdio MCP server
npm run build
npm run smoke:stdio -- node dist/index.js
```

## License

MIT
