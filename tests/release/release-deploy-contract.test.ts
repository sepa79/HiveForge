import { describe, expect, it } from "vitest";
import {
  renderDeploymentTemplate,
  validateReleaseDeployInput
} from "../../src/release/release-deploy-contract.js";

const validVars = {
  "imageRepository.project": "192.168.88.54:5000/pockethive",
  "release.imageTag": "dev-20260521-1415-gd6819e34",
  "extRepository.docker": "docker.io",
  "extRepository.ghcr": "ghcr.io"
};

describe("release deploy contract", () => {
  it("resolves PocketHive-style app image refs from explicit vars", () => {
    const plan = validateReleaseDeployInput({
      projectId: "pockethive",
      component: "stack",
      action: "deploy",
      profile: "single-reduced",
      vars: validVars,
      images: [
        {
          name: "auth-service",
          image: "{{ imageRepository.project }}/auth-service:{{ release.imageTag }}",
          application: true
        },
        {
          name: "orchestrator",
          image: "{{ imageRepository.project }}/orchestrator:{{ release.imageTag }}",
          application: true
        },
        {
          name: "rabbitmq",
          image: "{{ extRepository.docker }}/library/rabbitmq:3.13-management-alpine",
          application: false
        }
      ]
    });

    expect(plan.images).toEqual([
      {
        name: "auth-service",
        image: "192.168.88.54:5000/pockethive/auth-service:dev-20260521-1415-gd6819e34",
        application: true
      },
      {
        name: "orchestrator",
        image: "192.168.88.54:5000/pockethive/orchestrator:dev-20260521-1415-gd6819e34",
        application: true
      },
      {
        name: "rabbitmq",
        image: "docker.io/library/rabbitmq:3.13-management-alpine",
        application: false
      }
    ]);
  });

  it("rejects a missing release image tag before rendering images", () => {
    expect(() =>
      validateReleaseDeployInput({
        projectId: "pockethive",
        component: "stack",
        action: "deploy",
        vars: {
          "imageRepository.project": "192.168.88.54:5000/pockethive"
        },
        images: [
          {
            name: "orchestrator",
            image: "{{ imageRepository.project }}/orchestrator:{{ release.imageTag }}",
            application: true
          }
        ]
      })
    ).toThrow("Missing deployment var(s): release.imageTag");
  });

  it("rejects latest as the release image tag", () => {
    expect(() =>
      validateReleaseDeployInput({
        projectId: "pockethive",
        component: "stack",
        action: "deploy",
        vars: {
          ...validVars,
          "release.imageTag": "latest"
        },
        images: [
          {
            name: "orchestrator",
            image: "{{ imageRepository.project }}/orchestrator:{{ release.imageTag }}",
            application: true
          }
        ]
      })
    ).toThrow("release.imageTag must not be latest");
  });

  it("rejects unqualified application image refs", () => {
    expect(() =>
      validateReleaseDeployInput({
        projectId: "pockethive",
        component: "stack",
        action: "deploy",
        vars: validVars,
        images: [
          {
            name: "orchestrator",
            image: "orchestrator:dev-20260521-1415-gd6819e34",
            application: true
          }
        ]
      })
    ).toThrow("Application image orchestrator must be registry-qualified");
  });

  it("rejects application image refs without explicit tags or digests", () => {
    expect(() =>
      validateReleaseDeployInput({
        projectId: "pockethive",
        component: "stack",
        action: "deploy",
        vars: validVars,
        images: [
          {
            name: "orchestrator",
            image: "{{ imageRepository.project }}/orchestrator",
            application: true
          }
        ]
      })
    ).toThrow("Application image orchestrator must use an explicit non-latest tag or digest");
  });

  it("rejects unresolved template vars", () => {
    expect(() =>
      renderDeploymentTemplate("{{ imageRepository.project }}/orchestrator:{{ release.missingTag }}", validVars)
    ).toThrow("Missing deployment var(s): release.missingTag");
  });

  it("rejects unsupported lifecycle actions", () => {
    expect(() =>
      validateReleaseDeployInput({
        projectId: "pockethive",
        component: "stack",
        action: "rebuild",
        vars: validVars,
        images: [
          {
            name: "orchestrator",
            image: "{{ imageRepository.project }}/orchestrator:{{ release.imageTag }}",
            application: true
          }
        ]
      })
    ).toThrow("Unsupported lifecycle action: rebuild");
  });
});
