import { requireDeploymentVars, type DeploymentVars } from "../config/deployment-vars.js";

const TEMPLATE_VAR_PATTERN = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;
const LIFECYCLE_ACTIONS = new Set(["deploy", "remove", "purge", "update", "upgrade"]);
const REQUIRED_RELEASE_VARS = ["imageRepository.project", "release.imageTag"];

export interface ReleaseImageTemplate {
  name: string;
  image: string;
  application: boolean;
}

export interface ReleaseDeployInput {
  projectId: string;
  component: string;
  action: string;
  profile?: string;
  vars: DeploymentVars;
  images: ReleaseImageTemplate[];
  env?: Record<string, string>;
}

export interface ResolvedReleaseImage {
  name: string;
  image: string;
  application: boolean;
}

export interface ReleaseDeployPlan {
  projectId: string;
  component: string;
  action: string;
  profile?: string;
  vars: DeploymentVars;
  images: ResolvedReleaseImage[];
  env: Record<string, string>;
}

export function validateReleaseDeployInput(input: ReleaseDeployInput): ReleaseDeployPlan {
  requireNonEmpty("projectId", input.projectId);
  requireNonEmpty("component", input.component);
  requireNonEmpty("action", input.action);
  if (!LIFECYCLE_ACTIONS.has(input.action)) {
    throw new Error(`Unsupported lifecycle action: ${input.action}`);
  }
  if (input.profile !== undefined) {
    requireNonEmpty("profile", input.profile);
  }
  if (!Array.isArray(input.images) || input.images.length === 0) {
    throw new Error("Release deploy requires at least one image template");
  }

  requireDeploymentVars(input.vars, REQUIRED_RELEASE_VARS);
  assertExplicitReleaseTag(input.vars["release.imageTag"]);

  const images = input.images.map((image) => resolveReleaseImage(image, input.vars));
  for (const image of images) {
    if (image.application) {
      assertRegistryQualifiedImageRef(image.image, image.name);
      assertExplicitNonLatestImageRef(image.image, image.name);
    }
  }

  return {
    projectId: input.projectId,
    component: input.component,
    action: input.action,
    ...(input.profile ? { profile: input.profile } : {}),
    vars: { ...input.vars },
    images,
    env: { ...(input.env ?? {}) }
  };
}

export function renderDeploymentTemplate(template: string, vars: DeploymentVars): string {
  const missing = new Set<string>();
  const rendered = template.replace(TEMPLATE_VAR_PATTERN, (_match, name: string) => {
    const value = vars[name];
    if (!value) {
      missing.add(name);
      return "";
    }
    return value;
  });
  if (missing.size > 0) {
    throw new Error(`Missing deployment var(s): ${[...missing].sort().join(", ")}`);
  }
  if (rendered.includes("{{") || rendered.includes("}}")) {
    throw new Error(`Unresolved deployment template expression in: ${template}`);
  }
  return rendered;
}

export function assertRegistryQualifiedImageRef(imageRef: string, imageName = "image"): void {
  const repository = repositoryPart(imageRef);
  const firstSegment = repository.split("/")[0] ?? "";
  if (!repository.includes("/") || !isRegistryHost(firstSegment)) {
    throw new Error(`Application image ${imageName} must be registry-qualified: ${imageRef}`);
  }
}

export function assertExplicitNonLatestImageRef(imageRef: string, imageName = "image"): void {
  if (imageRef.includes("@")) {
    return;
  }

  const lastSegment = repositoryPart(imageRef).split("/").at(-1) ?? "";
  const tagSeparator = lastSegment.lastIndexOf(":");
  if (tagSeparator < 0 || tagSeparator === lastSegment.length - 1) {
    throw new Error(`Application image ${imageName} must use an explicit non-latest tag or digest: ${imageRef}`);
  }
  const tag = lastSegment.slice(tagSeparator + 1);
  if (tag === "latest") {
    throw new Error(`Application image ${imageName} must not use latest: ${imageRef}`);
  }
}

function resolveReleaseImage(image: ReleaseImageTemplate, vars: DeploymentVars): ResolvedReleaseImage {
  requireNonEmpty("image.name", image.name);
  requireNonEmpty(`image.${image.name}.template`, image.image);
  return {
    name: image.name,
    image: renderDeploymentTemplate(image.image, vars),
    application: Boolean(image.application)
  };
}

function assertExplicitReleaseTag(tag: string): void {
  if (tag === "latest") {
    throw new Error("release.imageTag must not be latest");
  }
}

function requireNonEmpty(name: string, value: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required field: ${name}`);
  }
}

function repositoryPart(imageRef: string): string {
  return imageRef.split("@")[0] ?? "";
}

function isRegistryHost(value: string): boolean {
  return value === "localhost" || value.includes(".") || value.includes(":");
}
