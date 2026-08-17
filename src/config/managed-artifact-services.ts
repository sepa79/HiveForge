import type { CommandRunner } from "../workspace/command-runner.js";

const FORGEJO_SERVICE_NAME = "forgejo";
const FORGEJO_GATEWAY_SERVICE_NAME = "forgejo-gateway";
const FORGEJO_ROOT_URL_ENV = "FORGEJO__server__ROOT_URL";
const FORGEJO_PACKAGES_ENABLED_ENV = "FORGEJO__packages__ENABLED";
const FORGEJO_INSTALL_LOCK_ENV = "FORGEJO__security__INSTALL_LOCK";
const FORGEJO_TRUSTED_LAN_AUTH_ENV = "FORGEJO__service__ENABLE_REVERSE_PROXY_AUTHENTICATION";
const FORGEJO_TRUSTED_LAN_API_AUTH_ENV = "FORGEJO__service__ENABLE_REVERSE_PROXY_AUTHENTICATION_API";
const FORGEJO_TRUSTED_LAN_AUTOREGISTRATION_ENV = "FORGEJO__service__ENABLE_REVERSE_PROXY_AUTO_REGISTRATION";
const FORGEJO_PUSH_TO_CREATE_ENV = "FORGEJO__repository__ENABLE_PUSH_CREATE_USER";
const COMPOSE_PROJECT_LABEL = "com.docker.compose.project";
const COMPOSE_SERVICE_LABEL = "com.docker.compose.service";
const STACK_NAMESPACE_LABEL = "com.docker.stack.namespace";
const INSECURE_REGISTRY_PREREQUISITE = "docker-insecure-registry";
const TRUSTED_LAN_OWNER = "hiveforge";
const FORGEJO_PLACEHOLDER_HOST = "forgejo-change-me.invalid";

export interface ManagedArtifactServicesOptions {
  currentContainerId?: () => string | undefined;
}

export interface ManagedArtifactServicesReport {
  status: "unavailable" | "incomplete" | "configured";
  reason?: string;
  workflow: string[];
  git?: {
    provider: "forgejo";
    baseUrl: string;
    authentication: "trusted-lan-no-login";
    owner: typeof TRUSTED_LAN_OWNER;
  };
  registry?: {
    address: string;
    transport: "insecure-http";
    authentication: "trusted-lan-no-login";
    owner: typeof TRUSTED_LAN_OWNER;
    prerequisite: {
      id: typeof INSECURE_REGISTRY_PREREQUISITE;
      status: "manual-unverified";
      registryAddress: string;
      requiredDockerDaemonSetting: "insecure-registries";
    };
  };
}

interface DockerContainerInspect {
  Config?: {
    Labels?: Record<string, string> | null;
    Env?: string[];
  };
}

interface DockerServiceListItem {
  Name?: string;
}

interface DockerScope {
  kind: "compose" | "swarm";
  name: string;
}

export class ManagedArtifactServices {
  private readonly currentContainerId: () => string | undefined;

  constructor(
    private readonly commandRunner: CommandRunner,
    options: ManagedArtifactServicesOptions = {}
  ) {
    this.currentContainerId = options.currentContainerId ?? (() => process.env.HOSTNAME);
  }

  async getInfo(): Promise<ManagedArtifactServicesReport> {
    let scope: DockerScope | undefined;
    try {
      scope = await this.resolveDockerScope();
    } catch (error) {
      return unavailable(
        `Managed Git and OCI service discovery could not inspect the current HiveForge runtime: ${errorMessage(error)}`
      );
    }
    if (!scope) {
      return unavailable("This HiveForge target has no running Full Forgejo service in its Docker Compose project or Swarm stack.");
    }

    let forgejoEnvironment: string[] | undefined;
    try {
      forgejoEnvironment = await this.findForgejoEnvironment(scope);
    } catch (error) {
      return unavailable(
        `Managed Git and OCI service discovery could not inspect Full services: ${errorMessage(error)}`
      );
    }
    if (!forgejoEnvironment) {
      return unavailable("This HiveForge target has no running Full Forgejo service in its Docker Compose project or Swarm stack.");
    }

    const rootUrl = environmentValue(forgejoEnvironment, FORGEJO_ROOT_URL_ENV);
    if (!rootUrl) {
      return {
        status: "incomplete",
        reason: `The Full Forgejo service does not define ${FORGEJO_ROOT_URL_ENV}.`,
        workflow: workflow()
      };
    }

    if (environmentValue(forgejoEnvironment, FORGEJO_PACKAGES_ENABLED_ENV) !== "true") {
      return {
        status: "incomplete",
        reason: `The Full Forgejo service does not enable ${FORGEJO_PACKAGES_ENABLED_ENV}.`,
        workflow: workflow()
      };
    }

    if (environmentValue(forgejoEnvironment, FORGEJO_INSTALL_LOCK_ENV) !== "true") {
      return {
        status: "incomplete",
        reason: `The Full Forgejo service does not enable ${FORGEJO_INSTALL_LOCK_ENV}.`,
        workflow: workflow()
      };
    }

    if (environmentValue(forgejoEnvironment, FORGEJO_TRUSTED_LAN_AUTH_ENV) !== "true") {
      return {
        status: "incomplete",
        reason: `The Full Forgejo service does not enable ${FORGEJO_TRUSTED_LAN_AUTH_ENV}.`,
        workflow: workflow()
      };
    }

    if (environmentValue(forgejoEnvironment, FORGEJO_TRUSTED_LAN_API_AUTH_ENV) !== "true") {
      return {
        status: "incomplete",
        reason: `The Full Forgejo service does not enable ${FORGEJO_TRUSTED_LAN_API_AUTH_ENV}.`,
        workflow: workflow()
      };
    }

    if (environmentValue(forgejoEnvironment, FORGEJO_TRUSTED_LAN_AUTOREGISTRATION_ENV) !== "true") {
      return {
        status: "incomplete",
        reason: `The Full Forgejo service does not enable ${FORGEJO_TRUSTED_LAN_AUTOREGISTRATION_ENV}.`,
        workflow: workflow()
      };
    }

    if (environmentValue(forgejoEnvironment, FORGEJO_PUSH_TO_CREATE_ENV) !== "true") {
      return {
        status: "incomplete",
        reason: `The Full Forgejo service does not enable ${FORGEJO_PUSH_TO_CREATE_ENV}.`,
        workflow: workflow()
      };
    }

    if (!(await this.hasForgejoGateway(scope))) {
      return {
        status: "incomplete",
        reason: "This Full Forgejo service has no running trusted-LAN gateway.",
        workflow: workflow()
      };
    }

    const endpoint = parseHttpForgejoRootUrl(rootUrl);
    if (endpoint instanceof Error) {
      return {
        status: "incomplete",
        reason: endpoint.message,
        workflow: workflow()
      };
    }
    if (usesPlaceholderForgejoEndpoint(endpoint)) {
      return {
        status: "incomplete",
        reason:
          `The Full Forgejo service still uses the shipped placeholder ${FORGEJO_ROOT_URL_ENV}. Replace it with the real public Git/OCI host and port.`,
        workflow: workflow()
      };
    }

    return {
      status: "configured",
      workflow: workflow(),
      git: {
        provider: "forgejo",
        baseUrl: endpoint.baseUrl,
        authentication: "trusted-lan-no-login",
        owner: TRUSTED_LAN_OWNER
      },
      registry: {
        address: endpoint.registryAddress,
        transport: "insecure-http",
        authentication: "trusted-lan-no-login",
        owner: TRUSTED_LAN_OWNER,
        prerequisite: {
          id: INSECURE_REGISTRY_PREREQUISITE,
          status: "manual-unverified",
          registryAddress: endpoint.registryAddress,
          requiredDockerDaemonSetting: "insecure-registries"
        }
      }
    };
  }

  private async resolveDockerScope(): Promise<DockerScope | undefined> {
    const currentContainerId = this.currentContainerId();
    if (!currentContainerId) {
      throw new Error("Managed artifact service discovery requires HOSTNAME to identify the running HiveForge container.");
    }

    const current = parseContainerInspect(
      (
        await this.commandRunner.run("docker", ["inspect", currentContainerId, "--format", "{{json .}}"])
      ).stdout,
      "HiveForge"
    );
    const labels = current.Config?.Labels ?? {};
    const composeProject = labels[COMPOSE_PROJECT_LABEL];
    if (composeProject) {
      return { kind: "compose", name: composeProject };
    }

    const stackNamespace = labels[STACK_NAMESPACE_LABEL];
    if (stackNamespace) {
      return { kind: "swarm", name: stackNamespace };
    }

    return undefined;
  }

  private async findForgejoEnvironment(scope: DockerScope): Promise<string[] | undefined> {
    if (scope.kind === "compose") {
      return this.findComposeForgejoEnvironment(scope.name);
    }
    return this.findSwarmForgejoEnvironment(scope.name);
  }

  private async findComposeForgejoEnvironment(project: string): Promise<string[] | undefined> {
    const ids = lines(
      (
        await this.commandRunner.run("docker", [
          "ps",
          "-q",
          "--filter",
          `label=${COMPOSE_PROJECT_LABEL}=${project}`,
          "--filter",
          `label=${COMPOSE_SERVICE_LABEL}=${FORGEJO_SERVICE_NAME}`
        ])
      ).stdout
    );
    if (ids.length === 0) {
      return undefined;
    }
    if (ids.length > 1) {
      throw new Error(`Managed artifact service discovery found multiple running Forgejo containers for Compose project ${project}.`);
    }
    const forgejo = parseContainerInspect(
      (
        await this.commandRunner.run("docker", ["inspect", ids[0], "--format", "{{json .}}"])
      ).stdout,
      "Forgejo"
    );
    return forgejo.Config?.Env ?? [];
  }

  private async findSwarmForgejoEnvironment(stackNamespace: string): Promise<string[] | undefined> {
    const services = lines(
      (
        await this.commandRunner.run("docker", [
          "service",
          "ls",
          "--filter",
          `label=${STACK_NAMESPACE_LABEL}=${stackNamespace}`,
          "--format",
          "{{json .}}"
        ])
      ).stdout
    ).map(parseServiceListItem);
    const expectedService = `${stackNamespace}_${FORGEJO_SERVICE_NAME}`;
    if (!services.some((service) => service.Name === expectedService)) {
      return undefined;
    }
    const result = await this.commandRunner.run("docker", [
      "service",
      "inspect",
      expectedService,
      "--format",
      "{{json .Spec.TaskTemplate.ContainerSpec.Env}}"
    ]);
    return parseEnvironment(result.stdout, "Forgejo Swarm service");
  }

  private async hasForgejoGateway(scope: DockerScope): Promise<boolean> {
    if (scope.kind === "compose") {
      const ids = lines(
        (
          await this.commandRunner.run("docker", [
            "ps",
            "-q",
            "--filter",
            `label=${COMPOSE_PROJECT_LABEL}=${scope.name}`,
            "--filter",
            `label=${COMPOSE_SERVICE_LABEL}=${FORGEJO_GATEWAY_SERVICE_NAME}`
          ])
        ).stdout
      );
      if (ids.length > 1) {
        throw new Error(`Managed artifact service discovery found multiple running Forgejo gateway containers for Compose project ${scope.name}.`);
      }
      return ids.length === 1;
    }

    const services = lines(
      (
        await this.commandRunner.run("docker", [
          "service",
          "ls",
          "--filter",
          `label=${STACK_NAMESPACE_LABEL}=${scope.name}`,
          "--format",
          "{{json .}}"
        ])
      ).stdout
    ).map(parseServiceListItem);
    return services.some((service) => service.Name === `${scope.name}_${FORGEJO_GATEWAY_SERVICE_NAME}`);
  }
}

function parseContainerInspect(raw: string, subject: string): DockerContainerInspect {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      throw new Error();
    }
    return parsed as DockerContainerInspect;
  } catch {
    throw new Error(`Docker inspect response for ${subject} is not an object.`);
  }
}

function parseServiceListItem(raw: string): DockerServiceListItem {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || (parsed.Name !== undefined && typeof parsed.Name !== "string")) {
      throw new Error();
    }
    return parsed as DockerServiceListItem;
  } catch {
    throw new Error("Docker service list response is not a JSON object.");
  }
}

function parseEnvironment(raw: string, subject: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === "string")) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new Error(`Docker inspect response for ${subject} does not contain an environment array.`);
  }
}

function environmentValue(environment: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  return environment.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

function parseHttpForgejoRootUrl(value: string): { baseUrl: string; registryAddress: string } | Error {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "http:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      !url.port
    ) {
      throw new Error();
    }
    return {
      baseUrl: url.toString(),
      registryAddress: url.host
    };
  } catch {
    return new Error(
      `${FORGEJO_ROOT_URL_ENV} must be an absolute root HTTP URL with an explicit port and no embedded credentials.`
    );
  }
}

function lines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function workflow(): string[] {
  return [
    "Push source to <git.baseUrl><git.owner>/<app>.git and images to <registry.address>/<registry.owner>/<app>:<tag> without Git or Docker login.",
    "Build with the existing local or agent toolchain, then push source and images through those services.",
    "Use the normal HiveForge deploy path with the image reference selected by the project profile."
  ];
}

function usesPlaceholderForgejoEndpoint(endpoint: { baseUrl: string; registryAddress: string }): boolean {
  try {
    const url = new URL(endpoint.baseUrl);
    return url.hostname === FORGEJO_PLACEHOLDER_HOST;
  } catch {
    return false;
  }
}

function unavailable(reason: string): ManagedArtifactServicesReport {
  return {
    status: "unavailable",
    reason,
    workflow: workflow()
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown discovery failure";
}
