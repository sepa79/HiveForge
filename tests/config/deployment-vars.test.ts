import { describe, expect, it } from "vitest";
import { requireDeploymentVars, resolveDeploymentVars } from "../../src/config/deployment-vars.js";

describe("deployment vars", () => {
  it("merges project defaults, environment overrides, and release vars explicitly", () => {
    expect(
      resolveDeploymentVars({
        project: {
          "imageRepository.project": "ghcr.io/pockethive",
          "extRepository.docker": "docker.io",
          "extRepository.ghcr": "ghcr.io"
        },
        environment: {
          "extRepository.docker": "company-cache.example.com/dockerhub",
          "extRepository.ghcr": "company-cache.example.com/ghcr"
        },
        release: {
          "release.imageTag": "1.2.3"
        }
      })
    ).toEqual({
      "imageRepository.project": "ghcr.io/pockethive",
      "extRepository.docker": "company-cache.example.com/dockerhub",
      "extRepository.ghcr": "company-cache.example.com/ghcr",
      "release.imageTag": "1.2.3"
    });
  });

  it("fails explicitly for missing template vars", () => {
    expect(() =>
      requireDeploymentVars(
        {
          "imageRepository.project": "ghcr.io/pockethive"
        },
        ["imageRepository.project", "release.imageTag"]
      )
    ).toThrow("Missing deployment var(s): release.imageTag");
  });
});
