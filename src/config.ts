export const MARKDOWN_NEW_BASE_URL = "https://markdown.new";
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

export const REQUEST_TIMEOUT_MS = parsePositiveInteger(
  process.env.MARKDOWN_NEW_TIMEOUT_MS,
  DEFAULT_REQUEST_TIMEOUT_MS
);
export const SERVER_VERSION = "1.0.3";

export const SUPPORTED_FORMATS_DESCRIPTION =
  "Supported inputs include PDF, DOCX, XLSX, XLS, CSV, HTML, XML, TXT, Markdown, JPG, PNG, WebP, SVG and other common document, spreadsheet, image and text formats. Maximum file size is 10MB.";

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
