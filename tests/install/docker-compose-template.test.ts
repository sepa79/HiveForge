import { readFile } from "node:fs/promises";
import YAML from "yaml";

describe("Docker Compose install template", () => {
  it("uses one explicit managed root host path for /hf and generated environment config", async () => {
    const raw = await readFile("deploy/docker-compose.hiveforge.yml", "utf8");
    const compose = YAML.parse(raw) as {
      services?: {
        hiveforge?: {
          environment?: Record<string, string>;
          volumes?: Array<{ source?: string; target?: string } | string>;
        };
      };
    };
    const hiveforge = compose.services?.hiveforge;

    expect(hiveforge?.environment?.HIVEFORGE_MANAGED_ROOT_BIND_SOURCE_ROOT).toBe(
      "${HIVEFORGE_MANAGED_ROOT_BIND_SOURCE_ROOT:-/opt/hiveforge}"
    );
    expect(hiveforge?.environment?.HIVEFORGE_ACTION_RUNNER_IMAGE).toBe(
      "${HIVEFORGE_IMAGE:-ghcr.io/sepa79/hiveforge:latest}"
    );
    expect(hiveforge?.volumes).toContainEqual({
      type: "bind",
      source: "${HIVEFORGE_MANAGED_ROOT_BIND_SOURCE_ROOT:-/opt/hiveforge}",
      target: "/hf"
    });
  });

  it("adds Forgejo and its trusted-LAN gateway through the Full overlay with an explicit HTTP endpoint and local data root", async () => {
    const raw = await readFile("deploy/docker-compose.hiveforge-full.yml", "utf8");
    const compose = YAML.parse(raw) as {
      services?: {
        hiveforge?: {
          environment?: Record<string, string>;
        };
        forgejo?: {
          image?: string;
          environment?: Record<string, string>;
          ports?: Array<{ target?: number; published?: string | number; mode?: string }>;
          volumes?: Array<{ source?: string; target?: string }>;
          deploy?: { placement?: { constraints?: string[] } };
        };
        "forgejo-gateway"?: {
          image?: string;
          ports?: Array<{ target?: number; published?: string | number; mode?: string }>;
          configs?: Array<{ source?: string; target?: string; mode?: number }>;
          deploy?: { placement?: { constraints?: string[] } };
        };
      };
      configs?: Record<string, { file?: string }>;
    };

    expect(compose.services?.hiveforge).toBeUndefined();
    expect(compose.services?.forgejo?.image).toBe("${HIVEFORGE_FORGEJO_IMAGE:-codeberg.org/forgejo/forgejo:16.0}");
    expect(compose.services?.forgejo?.environment).toMatchObject({
      FORGEJO__server__PROTOCOL: "http",
      FORGEJO__packages__ENABLED: "true",
      FORGEJO__security__INSTALL_LOCK: "true",
      FORGEJO__security__REVERSE_PROXY_TRUSTED_PROXIES: "*",
      FORGEJO__service__DISABLE_REGISTRATION: "true",
      FORGEJO__service__ENABLE_REVERSE_PROXY_AUTHENTICATION: "true",
      FORGEJO__service__ENABLE_REVERSE_PROXY_AUTHENTICATION_API: "true",
      FORGEJO__service__ENABLE_REVERSE_PROXY_AUTO_REGISTRATION: "true",
      FORGEJO__repository__ENABLE_PUSH_CREATE_USER: "true"
    });
    expect(compose.services?.forgejo?.ports).toBeUndefined();
    expect(compose.services?.["forgejo-gateway"]?.image).toBe("nginx:1.27-alpine");
    expect(compose.services?.["forgejo-gateway"]?.ports).toContainEqual({
      target: 3000,
      published: "${HIVEFORGE_FORGEJO_HTTP_PORT:-3001}",
      protocol: "tcp",
      mode: "ingress"
    });
    expect(compose.services?.forgejo?.volumes).toContainEqual({
      type: "bind",
      source: "${HIVEFORGE_FORGEJO_DATA_ROOT:-/opt/hiveforge/forgejo}",
      target: "/data"
    });
    expect(compose.services?.forgejo?.deploy?.placement?.constraints).toContain(
      "node.hostname == ${HIVEFORGE_FORGEJO_NODE:?Set HIVEFORGE_FORGEJO_NODE to the manager that owns HIVEFORGE_FORGEJO_DATA_ROOT}"
    );
    expect(compose.services?.["forgejo-gateway"]?.configs).toContainEqual({
      source: "forgejo_gateway_nginx",
      target: "/etc/nginx/conf.d/default.conf",
      mode: 444
    });
    expect(compose.configs?.forgejo_gateway_nginx).toEqual({ file: "./forgejo-gateway.nginx.conf" });
  });

  it("makes the trusted-LAN gateway the only public Forgejo endpoint", async () => {
    const raw = await readFile("deploy/forgejo-gateway.nginx.conf", "utf8");

    expect(raw).toContain("proxy_pass http://forgejo:3000;");
    expect(raw).toContain("proxy_set_header X-WEBAUTH-USER hiveforge;");
    expect(raw).toContain('proxy_set_header Authorization "";');
    expect(raw).toContain("client_max_body_size 0;");
  });
});
