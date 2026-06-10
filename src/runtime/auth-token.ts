import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runtimeFileNames } from "./runtime-paths.js";

export interface AuthTokenResolution {
  authToken: string;
  source: "environment" | "file" | "generated";
  tokenPath?: string;
  ignoredTokenPath?: string;
}

export async function resolveAuthToken(options: {
  authToken?: string;
  runtimeRoot?: string;
}): Promise<AuthTokenResolution> {
  if (options.authToken) {
    return {
      authToken: options.authToken,
      source: "environment",
      ...(options.runtimeRoot ? await ignoredRuntimeRootToken(options.runtimeRoot) : {})
    };
  }

  if (!options.runtimeRoot) {
    throw new Error("Missing required environment variable: HIVEFORGE_AUTH_TOKEN");
  }

  const tokenPath = path.join(options.runtimeRoot, runtimeFileNames.authToken);
  const existingToken = await readTokenFile(tokenPath);
  if (existingToken) {
    return { authToken: existingToken, source: "file", tokenPath };
  }

  const generatedToken = randomBytes(32).toString("base64url");
  await writeFile(tokenPath, `${generatedToken}\n`, { encoding: "utf8", flag: "wx", mode: 0o644 }).catch(
    async (error: unknown) => {
      if (isNodeError(error, "EEXIST")) {
        return;
      }
      throw error;
    }
  );

  return {
    authToken: (await readTokenFile(tokenPath)) ?? generatedToken,
    source: "generated",
    tokenPath
  };
}

async function ignoredRuntimeRootToken(runtimeRoot: string): Promise<Pick<AuthTokenResolution, "ignoredTokenPath">> {
  const tokenPath = path.join(runtimeRoot, runtimeFileNames.authToken);
  return (await readTokenFile(tokenPath)) ? { ignoredTokenPath: tokenPath } : {};
}

async function readTokenFile(tokenPath: string): Promise<string | undefined> {
  const token = await readFile(tokenPath, "utf8").catch((error: unknown) => {
    if (isNodeError(error, "ENOENT")) {
      return undefined;
    }
    throw error;
  });
  const normalized = token?.trim();
  return normalized ? normalized : undefined;
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
