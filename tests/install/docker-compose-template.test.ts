import { readFile } from "node:fs/promises";
import YAML from "yaml";

describe("Docker Compose install template", () => {
  it("uses one explicit managed root host path for /hf and generated environment config", async () => {
    const raw = await readFile("deploy/docker-compose.hiveforge.yml", "utf8");
    const compose = YAML.parse(raw) as {
      services?: {
        hiveforge?: {
          environment?: Record<string, string>;
          ports?: Array<{ target?: number; published?: string | number; mode?: string }>;
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
    expect(hiveforge?.ports).toContainEqual({
      target: 3000,
      published: 3000,
      protocol: "tcp",
      mode: "ingress"
    });
    expect(hiveforge?.volumes).toContainEqual({
      type: "bind",
      source: "${HIVEFORGE_MANAGED_ROOT_BIND_SOURCE_ROOT:-/opt/hiveforge}",
      target: "/hf"
    });
  });

  it("makes Full a standalone HiveForge, Forgejo, and trusted-LAN gateway install with an explicit HTTP endpoint and local data root", async () => {
    const [liteRaw, raw] = await Promise.all([
      readFile("deploy/docker-compose.hiveforge.yml", "utf8"),
      readFile("deploy/docker-compose.hiveforge-full.yml", "utf8")
    ]);
    const lite = YAML.parse(liteRaw) as {
      services?: {
        hiveforge?: unknown;
      };
    };
    const compose = YAML.parse(raw) as {
      services?: {
        hiveforge?: {
          environment?: Record<string, string>;
          ports?: Array<{ target?: number; published?: string | number; mode?: string }>;
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
          environment?: Record<string, string>;
          command?: string[];
          deploy?: { placement?: { constraints?: string[] } };
        };
      };
    };

    expect(compose.services?.hiveforge).toEqual(lite.services?.hiveforge);
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
      published: 3001,
      protocol: "tcp",
      mode: "ingress"
    });
    expect(compose.services?.forgejo?.volumes).toContainEqual({
      type: "bind",
      source: "${HIVEFORGE_FORGEJO_DATA_ROOT:-/opt/hiveforge/forgejo}",
      target: "/data"
    });
    expect(compose.services?.forgejo?.deploy?.placement?.constraints).toContain(
      "node.hostname == CHANGE-ME-SWARM-MANAGER-HOSTNAME"
    );
    expect(compose.services?.["forgejo-gateway"]?.command).toEqual([
      "/bin/sh",
      "-ec",
      "printf '%s\\n' \"$${NGINX_GATEWAY_CONFIG}\" > /etc/nginx/conf.d/default.conf\nexec nginx -g 'daemon off;'\n"
    ]);
  });

  it("makes the trusted-LAN gateway the only public Forgejo endpoint", async () => {
    const raw = await readFile("deploy/docker-compose.hiveforge-full.yml", "utf8");

    expect(raw).toContain("proxy_pass http://forgejo:3000;");
    expect(raw).toContain("proxy_set_header X-WEBAUTH-USER hiveforge;");
    expect(raw).toContain('proxy_set_header Authorization "";');
    expect(raw).toContain("client_max_body_size 0;");
    expect(raw).toContain("$${NGINX_GATEWAY_CONFIG}");
    expect(raw).not.toContain("forgejo-gateway.nginx.conf");
  });
});
