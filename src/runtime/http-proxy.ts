import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

const PROXY_ENV_NAMES = ["HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"] as const;

export function configureHttpProxyFromEnv(environment: NodeJS.ProcessEnv = process.env): boolean {
  if (!PROXY_ENV_NAMES.some((name) => nonEmpty(environment[name]))) {
    return false;
  }

  setGlobalDispatcher(new EnvHttpProxyAgent());
  return true;
}

function nonEmpty(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}
