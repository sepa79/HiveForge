import { describe, expect, it } from "vitest";
import { resolveReleaseArtifactTemplate } from "../../src/release/release-artifact.js";
import { ReleaseDeployService } from "../../src/release/release-deploy-service.js";

const vars = {
  "imageRepository.project": "registry.lan:5000/pockethive",
  "release.imageTag": "dev-20260521-1415-gd6819e34"
};

describe("release artifact rendering", () => {
  it("renders PocketHive compose env without relying on compose defaults", () => {
    const artifact = resolveReleaseArtifactTemplate(pocketHiveArtifact(), vars);

    expect(artifact.env).toEqual({
      DOCKER_REGISTRY: "registry.lan:5000/pockethive/",
      POCKETHIVE_VERSION: "dev-20260521-1415-gd6819e34"
    });
  });

  it("prepares a PocketHive-like release plan from artifact images", async () => {
    const service = new ReleaseDeployService();

    const result = await service.prepare({
      projectId: "pockethive",
      component: "stack",
      action: "deploy",
      project: {
        id: "pockethive"
      },
      releaseVars: vars,
      artifact: pocketHiveArtifact()
    });

    expect(result.plan.env).toEqual({
      DOCKER_REGISTRY: "registry.lan:5000/pockethive/",
      POCKETHIVE_VERSION: "dev-20260521-1415-gd6819e34"
    });
    expect(result.plan.images.map((image) => image.name)).toEqual([
      "auth-service",
      "orchestrator",
      "scenario-manager",
      "network-proxy-manager",
      "ui-v2",
      "processor"
    ]);
    expect(result.plan.images[5]?.image).toBe("registry.lan:5000/pockethive/processor:dev-20260521-1415-gd6819e34");
  });

  it("rejects artifact env templates with missing vars", () => {
    expect(() =>
      resolveReleaseArtifactTemplate(
        {
          images: pocketHiveArtifact().images,
          env: {
            POCKETHIVE_VERSION: "{{ release.missingTag }}"
          }
        },
        vars
      )
    ).toThrow("Missing deployment var(s): release.missingTag");
  });
});

function pocketHiveArtifact() {
  return {
    env: {
      DOCKER_REGISTRY: "{{ imageRepository.project }}/",
      POCKETHIVE_VERSION: "{{ release.imageTag }}"
    },
    images: [
      appImage("auth-service"),
      appImage("orchestrator"),
      appImage("scenario-manager"),
      appImage("network-proxy-manager"),
      appImage("ui-v2"),
      appImage("processor")
    ]
  };
}

function appImage(name: string) {
  return {
    name,
    image: `{{ imageRepository.project }}/${name}:{{ release.imageTag }}`,
    application: true
  };
}
