import { createServer, type Server } from "node:http";
import { URL } from "node:url";
import type { HttpRoute } from "./http-types.js";
import { toErrorResponse, writeJson } from "./json-http.js";

export interface HttpServerOptions {
  authToken?: string;
  publicPaths?: RegExp[];
}

export function createHttpServer(routes: HttpRoute[], options: HttpServerOptions = {}): Server {
  return createServer(async (request, response) => {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", "http://localhost");
    const pathname = url.pathname;
    const isPublic = options.publicPaths?.some((pattern) => pattern.test(pathname)) ?? false;

    if (!isPublic && options.authToken && request.headers.authorization !== `Bearer ${options.authToken}`) {
      writeJson(response, 401, { error: "Unauthorized" });
      return;
    }

    const route = routes.find((candidate) => candidate.method === method && candidate.pattern.test(pathname));

    if (!route) {
      writeJson(response, 404, { error: "Not found" });
      return;
    }

    const match = route.pattern.exec(pathname);

    try {
      const body = await route.handle({
        request,
        response,
        method,
        pathname,
        params: match?.groups ?? {}
      });
      if (response.writableEnded) {
        return;
      }
      writeJson(response, 200, body);
    } catch (error) {
      const { statusCode, body } = toErrorResponse(error);
      writeJson(response, statusCode, body);
    }
  });
}
