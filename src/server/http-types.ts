import type { IncomingMessage, ServerResponse } from "node:http";

export interface HttpRequestContext {
  request: IncomingMessage;
  response: ServerResponse;
  method: string;
  pathname: string;
  params: Record<string, string>;
}

export interface HttpRoute {
  method: string;
  pattern: RegExp;
  handle(context: HttpRequestContext): Promise<unknown>;
}
