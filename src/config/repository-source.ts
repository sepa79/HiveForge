import type { RegisteredProject } from "./project-registry-types.js";

export const GITHUB_GIT_REPOSITORY_PATTERN = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/;
export const FILE_GIT_REPOSITORY_PATTERN = /^file:\/\/\/.+/;

export function isInspectableRepository(repository: string): boolean {
  return (
    GITHUB_GIT_REPOSITORY_PATTERN.test(repository) ||
    FILE_GIT_REPOSITORY_PATTERN.test(repository) ||
    isLanHttpGitRepository(repository)
  );
}

export function sourceForRepository(repository: string): RegisteredProject["source"] {
  if (FILE_GIT_REPOSITORY_PATTERN.test(repository)) {
    return "local-git";
  }
  if (GITHUB_GIT_REPOSITORY_PATTERN.test(repository)) {
    return "github";
  }
  if (isLanHttpGitRepository(repository)) {
    return "http-git";
  }
  throw new Error(`Repository source is not supported for registration: ${repository}`);
}

function isLanHttpGitRepository(repository: string): boolean {
  let url: URL;
  try {
    url = new URL(repository);
  } catch {
    return false;
  }

  return (
    url.protocol === "http:" &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "" &&
    url.pathname.length > "/.git".length &&
    url.pathname.endsWith(".git") &&
    isInternalHost(url.hostname)
  );
}

function isInternalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return isPrivateIpv4(host) || host === "localhost" || isLocalDnsName(host) || isSingleLabelDnsName(host);
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".");
  if (octets.length !== 4) {
    return false;
  }

  const values = octets.map((octet) => (octet === "" ? Number.NaN : Number(octet)));
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false;
  }

  const [first, second] = values;
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isSingleLabelDnsName(hostname: string): boolean {
  return !hostname.includes(".") && isDnsLabel(hostname);
}

function isLocalDnsName(hostname: string): boolean {
  if (!hostname.endsWith(".local")) {
    return false;
  }
  const labels = hostname.slice(0, -".local".length).split(".");
  return labels.length > 0 && labels.every(isDnsLabel);
}

function isDnsLabel(label: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
}
