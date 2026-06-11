export interface MarkdownResponse {
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
