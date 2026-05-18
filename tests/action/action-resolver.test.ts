import { describe, expect, it } from "vitest";
import { resolveDeclaredAction } from "../../src/action/action-resolver.js";
import type { ProjectRegistry } from "../../src/manifest/manifest-types.js";

describe("action resolver", () => {
  it("resolves only actions declared by managed component manifests", () => {
    expect(resolveDeclaredAction(registry(), "/workspace", "api", "deploy")).toEqual({
      component: "api",
      action: "deploy",
      adapter: "ansible",
      componentDir: "/workspace/components/api",
      playbook: "ansible/deploy.yml"
    });
  });

  it("rejects unmanaged components", () => {
    expect(() => resolveDeclaredAction(registry(), "/workspace", "worker", "deploy")).toThrow(
      "Component is not managed by HiveForge: worker"
    );
  });

  it("rejects undeclared actions", () => {
    expect(() => resolveDeclaredAction(registry(), "/workspace", "api", "restart")).toThrow(
      "Action is not declared for api: restart"
    );
  });
});

function registry(): ProjectRegistry {
  return {
    project: {
      name: "hivewatch",
      repository: "https://github.com/sepa79/HiveWatch.git",
      actions: ["deploy"]
    },
    components: [
      {
        name: "api",
        manifestPath: "components/api/hiveforge.yaml",
        manifest: {
          kind: "component",
          component: {
            name: "api",
            project: "hivewatch"
          },
          deployment: {
            adapter: "ansible",
            actions: {
              deploy: {
                playbook: "ansible/deploy.yml"
              }
            }
          }
        }
      }
    ]
  };
}
