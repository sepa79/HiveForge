import type { ProjectRegistry } from "../manifest/manifest-types.js";
import type { DockerProbe } from "./docker-probe.js";

export interface RequirementValidationIssue {
  component: string;
  requirementType: "volume" | "secret" | "environment";
  name: string;
  message: string;
}

export interface RequirementValidationReport {
  ok: boolean;
  issues: RequirementValidationIssue[];
}

export class RequirementValidationError extends Error {
  constructor(public readonly report: RequirementValidationReport) {
    super(formatValidationFailure(report));
    this.name = "RequirementValidationError";
  }
}

export class RequirementValidator {
  constructor(
    private readonly dockerProbe: DockerProbe,
    private readonly environment: NodeJS.ProcessEnv = process.env
  ) {}

  async validateProject(
    registry: ProjectRegistry,
    environmentOverrides: NodeJS.ProcessEnv = {}
  ): Promise<RequirementValidationReport> {
    const issues: RequirementValidationIssue[] = [];

    for (const component of registry.components) {
      const requirements = component.manifest.requirements;
      if (!requirements) {
        continue;
      }

      for (const volume of requirements.volumes ?? []) {
        if (!(await this.dockerProbe.volumeExists(volume))) {
          issues.push({
            component: component.name,
            requirementType: "volume",
            name: volume,
            message: `Missing Docker volume for ${component.name}: ${volume}`
          });
        }
      }

      for (const secret of requirements.secrets ?? []) {
        if (!(await this.dockerProbe.secretExists(secret))) {
          issues.push({
            component: component.name,
            requirementType: "secret",
            name: secret,
            message: `Missing Docker secret for ${component.name}: ${secret}`
          });
        }
      }

      for (const variable of requirements.environment ?? []) {
        if (!environmentOverrides[variable] && !this.environment[variable]) {
          issues.push({
            component: component.name,
            requirementType: "environment",
            name: variable,
            message: `Missing environment variable for ${component.name}: ${variable}`
          });
        }
      }
    }

    return {
      ok: issues.length === 0,
      issues
    };
  }

  async assertProjectValid(
    registry: ProjectRegistry,
    environmentOverrides: NodeJS.ProcessEnv = {}
  ): Promise<RequirementValidationReport> {
    const report = await this.validateProject(registry, environmentOverrides);
    if (!report.ok) {
      throw new RequirementValidationError(report);
    }
    return report;
  }
}

function formatValidationFailure(report: RequirementValidationReport): string {
  return report.issues.map((issue) => issue.message).join("; ");
}
