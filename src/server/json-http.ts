import type { IncomingMessage, ServerResponse } from "node:http";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Invalid JSON request body");
  }
}

export function writeJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(`${JSON.stringify(value)}\n`);
}

export function writeText(response: ServerResponse, statusCode: number, contentType: string, value: string): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", contentType);
  response.end(value);
}

export function toErrorResponse(error: unknown): { statusCode: number; body: { error: string } } {
  if (error instanceof HttpError) {
    return { statusCode: error.statusCode, body: { error: error.message } };
  }

  return {
    statusCode: 500,
    body: {
      error: error instanceof Error ? error.message : "Request failed"
    }
  };
}
