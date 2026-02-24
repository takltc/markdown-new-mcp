# markdown-new-mcp

MCP (Model Context Protocol) server for [markdown.new](https://markdown.new) file conversion API. Convert PDF, DOCX, XLSX, images and 20+ formats to Markdown.

## Installation

```bash
npm install markdown-new-mcp
```

## Usage

### With Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "markdown-new": {
      "command": "npx",
      "args": ["markdown-new-mcp"]
    }
  }
}
```

### With API Key (Optional)

For higher rate limits, you can provide an API key:

```json
{
  "mcpServers": {
    "markdown-new": {
      "command": "npx",
      "args": ["markdown-new-mcp"],
      "env": {
        "MARKDOWN_NEW_API_KEY": "mk_your_api_key_here"
      }
    }
  }
}
```

## Available Tools

### `convert_url_to_markdown`

Convert a remote file URL to Markdown.

**Parameters:**
- `url` (string, required): The URL of the remote file to convert
- `api_key` (string, optional): API key for higher rate limits

**Example:**
```
Convert this PDF to markdown: https://example.com/document.pdf
```

### `convert_file_to_markdown`

Convert a local file to Markdown.

**Parameters:**
- `file_path` (string, required): The absolute path to the local file
- `api_key` (string, optional): API key for higher rate limits

**Example:**
```
Convert /path/to/document.pdf to markdown
```

### `convert_url_to_json`

Convert a remote file URL to JSON with metadata (title, tokens, duration, etc).

**Parameters:**
- `url` (string, required): The URL of the remote file
- `api_key` (string, optional): API key for higher rate limits

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
```

## License

MIT
