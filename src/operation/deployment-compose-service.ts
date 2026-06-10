import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import type { Journal } from "../journal/journal.js";
import type { JournalArtifact, JournalEvent } from "../journal/journal-event.js";

export interface DeploymentComposeResult {
  operationId: string;
  status: "present" | "missing";
  source: "operation_artifact" | "none";
  artifact?: {
    name: "compose";
    path: string;
    mediaType: string;
    sha256: string;
    bytes: number;
    recordedAt: string;
    currentSha256: string;
    currentBytes: number;
    digestMatchesJournal: boolean;
  };
  content?: string;
  redacted: boolean;
  reason?: string;
}

export class DeploymentComposeService {
  constructor(private readonly journal: Journal) {}

  async get(operationId: string): Promise<DeploymentComposeResult> {
    const event = await this.findOperation(operationId);
    const artifact = event?.artifacts?.find((candidate) => candidate.name === "compose");
    if (!event || !artifact) {
      return {
        operationId,
        status: "missing",
        source: "none",
        redacted: false,
        reason: event
          ? "Operation has no recorded compose artifact. HiveForge does not re-render or guess compose files from current source."
          : `Operation not found in journal: ${operationId}`
      };
    }

    return this.readArtifact(operationId, artifact);
  }

  private async findOperation(operationId: string): Promise<JournalEvent | undefined> {
    return (await this.journal.readAll())
      .filter((event) => event.operationId === operationId && event.operationType === "run_action")
      .at(-1);
  }

  private async readArtifact(operationId: string, artifact: JournalArtifact): Promise<DeploymentComposeResult> {
    let raw: string;
    let artifactStat: Awaited<ReturnType<typeof stat>>;
    try {
      artifactStat = await stat(artifact.path);
      raw = await readFile(artifact.path, "utf8");
    } catch (error) {
      return {
        operationId,
        status: "missing",
        source: "operation_artifact",
        artifact: {
          ...artifact,
          currentSha256: "",
          currentBytes: 0,
          digestMatchesJournal: false
        },
        redacted: false,
        reason: `Recorded compose artifact is not readable: ${errorMessage(error)}`
      };
    }

    const currentSha256 = sha256(raw);
    return {
      operationId,
      status: "present",
      source: "operation_artifact",
      artifact: {
        ...artifact,
        currentSha256,
        currentBytes: artifactStat.size,
        digestMatchesJournal: currentSha256 === artifact.sha256
      },
      content: redactCompose(raw),
      redacted: raw !== redactCompose(raw)
    };
  }
}

const SENSITIVE_LINE = /(?:password|passwd|token|secret|private[_-]?key|credential|access[_-]?key|auth[_-]?token)/i;

function redactCompose(value: string): string {
  return value
    .split("\n")
    .map((line) => {
      if (!SENSITIVE_LINE.test(line)) {
        return line;
      }
      return line.replace(/(:\s*).+$/, "$1[redacted]").replace(/(=\s*)\S+$/, "$1[redacted]");
    })
    .join("\n");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
