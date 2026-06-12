import path from "node:path";
import type { HiveForgeInfo } from "../app-info.js";
import type { CommandRunner } from "../workspace/command-runner.js";

export interface SelfUpdateCheckResult {
  currentVersion: string;
  releasePublished: boolean;
  latestVersion?: string;
  latestTag?: string;
  releaseUrl?: string;
  updateAvailable: boolean;
}

export interface SelfUpdateStartResult extends SelfUpdateCheckResult {
  status: "no_release" | "up_to_date" | "started";
  mode?: SelfUpdateMode;
  targetImage?: string;
  helperContainerId?: string;
}

export type SelfUpdateMode = "docker-compose" | "swarm-service";

export interface SelfUpdateServiceOptions {
  appInfo: HiveForgeInfo;
  commandRunner: CommandRunner;
  fetchImpl?: FetchLike;
  latestReleaseUrl?: string;
  imageRepository?: string;
  now?: () => number;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

interface GitHubReleaseResponse {
  tag_name: string;
  html_url: string;
}

interface DockerContainerInspect {
  Config?: {
    Image?: string;
    Labels?: Record<string, string> | null;
  };
  Mounts?: Array<{
    Source?: string;
    Destination?: string;
  }>;
}

interface SelfUpdateTarget {
  mode: SelfUpdateMode;
  currentImage: string;
  composeProject?: string;
  swarmService?: string;
  runtimeRootSource?: string;
}

const DEFAULT_LATEST_RELEASE_URL = "https://api.github.com/repos/sepa79/HiveForge/releases/latest";
const DEFAULT_IMAGE_REPOSITORY = "ghcr.io/sepa79/hiveforge";
const HIVEFORGE_RUNTIME_ROOT = "/hf";
const HIVEFORGE_COMPOSE_FILE = "docker-compose.hiveforge.yml";
const DOCKER_SOCKET_MOUNT = "/var/run/docker.sock:/var/run/docker.sock";
const COMPOSE_PROJECT_LABEL = "com.docker.compose.project";
const SWARM_SERVICE_LABEL = "com.docker.swarm.service.name";
const STACK_NAMESPACE_LABEL = "com.docker.stack.namespace";
const SELF_UPDATE_HELPER_PREFIX = "hiveforge-self-update";
const UPDATE_DELAY_SECONDS = 1;

export class SelfUpdateService {
  private readonly fetchImpl: FetchLike;
  private readonly latestReleaseUrl: string;
  private readonly imageRepository: string;
  private readonly now: () => number;

  constructor(private readonly options: SelfUpdateServiceOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.latestReleaseUrl = options.latestReleaseUrl ?? DEFAULT_LATEST_RELEASE_URL;
    this.imageRepository = options.imageRepository ?? DEFAULT_IMAGE_REPOSITORY;
    this.now = options.now ?? Date.now;
  }

  async checkLatest(): Promise<SelfUpdateCheckResult> {
    const latest = await this.fetchLatestRelease();
    const currentVersion = normalizeVersion(this.options.appInfo.version);
    if (!latest) {
      return {
        currentVersion,
        releasePublished: false,
        updateAvailable: false
      };
    }
    const latestVersion = normalizeVersion(latest.tag_name);
    return {
      currentVersion,
      releasePublished: true,
      latestVersion,
      latestTag: latest.tag_name,
      releaseUrl: latest.html_url,
      updateAvailable: compareVersions(latestVersion, currentVersion) > 0
    };
  }

  async startUpdate(): Promise<SelfUpdateStartResult> {
    const check = await this.checkLatest();
    if (!check.releasePublished) {
      return {
        ...check,
        status: "no_release"
      };
    }
    if (!check.updateAvailable) {
      return {
        ...check,
        status: "up_to_date"
      };
    }

    const target = await this.resolveTarget();
    if (!check.latestTag) {
      throw new Error("HiveForge self-update requires a published latest release tag.");
    }
    const targetImage = `${this.imageRepository}:${check.latestTag}`;
    const helperContainerId = await this.startHelper(target, targetImage);
    return {
      ...check,
      status: "started",
      mode: target.mode,
      targetImage,
      helperContainerId
    };
  }

  private async fetchLatestRelease(): Promise<GitHubReleaseResponse | null> {
    const response = await this.fetchLatestReleaseResponse();
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`GitHub latest release request failed: ${response.status}`);
    }
    const body = (await response.json()) as unknown;
    if (!isRecord(body) || typeof body.tag_name !== "string" || typeof body.html_url !== "string") {
      throw new Error("GitHub latest release response is missing tag_name or html_url.");
    }
    return {
      tag_name: body.tag_name,
      html_url: body.html_url
    };
  }

  private async fetchLatestReleaseResponse(): Promise<Response> {
    try {
      return await this.fetchImpl(this.latestReleaseUrl, {
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "HiveForge self-update"
        }
      });
    } catch (error) {
      throw new Error(
        `GitHub latest release request failed before response: ${networkErrorMessage(
          error
        )}. Check outbound HTTPS/proxy access from the HiveForge container to ${this.latestReleaseUrl}.`
      );
    }
  }

  private async resolveTarget(): Promise<SelfUpdateTarget> {
    const hostname = process.env.HOSTNAME;
    if (!hostname) {
      throw new Error("HiveForge self-update requires HOSTNAME to identify the running container.");
    }

    const result = await this.options.commandRunner.run("docker", ["inspect", hostname, "--format", "{{json .}}"]);
    const inspect = parseInspect(result.stdout);
    const labels = inspect.Config?.Labels ?? {};
    const currentImage = inspect.Config?.Image;
    if (!currentImage) {
      throw new Error("HiveForge self-update could not determine the current container image.");
    }

    const swarmService = labels[SWARM_SERVICE_LABEL];
    if (swarmService) {
      return {
        mode: "swarm-service",
        currentImage,
        swarmService
      };
    }

    const composeProject = labels[COMPOSE_PROJECT_LABEL];
    if (composeProject) {
      const runtimeRootSource = runtimeRootSourceFrom(inspect);
      return {
        mode: "docker-compose",
        currentImage,
        composeProject,
        runtimeRootSource
      };
    }

    const stackNamespace = labels[STACK_NAMESPACE_LABEL];
    throw new Error(
      stackNamespace
        ? `HiveForge self-update could not determine Swarm service name from container labels for stack ${stackNamespace}.`
        : "HiveForge self-update requires Docker Compose or Swarm service labels on the running container."
    );
  }

  private async startHelper(target: SelfUpdateTarget, targetImage: string): Promise<string> {
    const helperName = `${SELF_UPDATE_HELPER_PREFIX}-${this.now()}`;
    const args = ["run", "-d", "--rm", "--name", helperName, "-v", DOCKER_SOCKET_MOUNT];

    if (target.mode === "docker-compose") {
      if (!target.runtimeRootSource) {
        throw new Error("Docker Compose self-update requires the host source mounted at /hf.");
      }
      args.push(
        "-v",
        `${target.runtimeRootSource}:${HIVEFORGE_RUNTIME_ROOT}`,
        "-w",
        HIVEFORGE_RUNTIME_ROOT,
        "-e",
        `HIVEFORGE_IMAGE=${targetImage}`,
        "-e",
        `HIVEFORGE_COMPOSE_PROJECT=${target.composeProject ?? ""}`,
        target.currentImage,
        "sh",
        "-c",
        `sleep ${UPDATE_DELAY_SECONDS}; docker compose -p "$HIVEFORGE_COMPOSE_PROJECT" -f ${path.posix.join(
          HIVEFORGE_RUNTIME_ROOT,
          HIVEFORGE_COMPOSE_FILE
        )} up -d`
      );
    } else {
      args.push(
        "-e",
        `HIVEFORGE_TARGET_IMAGE=${targetImage}`,
        "-e",
        `HIVEFORGE_SWARM_SERVICE=${target.swarmService ?? ""}`,
        target.currentImage,
        "sh",
        "-c",
        `sleep ${UPDATE_DELAY_SECONDS}; docker service update --image "$HIVEFORGE_TARGET_IMAGE" "$HIVEFORGE_SWARM_SERVICE"`
      );
    }

    const result = await this.options.commandRunner.run("docker", args);
    return result.stdout.trim();
  }
}

function parseInspect(stdout: string): DockerContainerInspect {
  const parsed = JSON.parse(stdout) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Docker inspect response for the HiveForge container is not an object.");
  }
  return parsed as DockerContainerInspect;
}

function runtimeRootSourceFrom(inspect: DockerContainerInspect): string | undefined {
  const mount = inspect.Mounts?.find((candidate) => candidate.Destination === HIVEFORGE_RUNTIME_ROOT);
  if (!mount?.Source) {
    return undefined;
  }
  if (!path.isAbsolute(mount.Source)) {
    throw new Error(`Docker Compose self-update requires an absolute host source for /hf: ${mount.Source}`);
  }
  return mount.Source;
}

function normalizeVersion(version: string): string {
  const trimmed = version.trim();
  const match = /^v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid HiveForge version: ${version}`);
  }
  return match[1];
}

function compareVersions(left: string, right: string): number {
  const leftParts = numericVersionParts(left);
  const rightParts = numericVersionParts(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    const delta = leftParts[index] - rightParts[index];
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

function numericVersionParts(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) {
    throw new Error(`Invalid HiveForge version: ${version}`);
  }
  return [Number.parseInt(match[1], 10), Number.parseInt(match[2], 10), Number.parseInt(match[3], 10)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function networkErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const cause = "cause" in error && error.cause instanceof Error ? `; cause: ${error.cause.message}` : "";
  return `${error.message}${cause}`;
}
