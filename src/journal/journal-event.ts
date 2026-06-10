export type JournalOperationType = "checkout_project" | "inspect_project" | "validate_requirements" | "run_action";
export type JournalStatus = "succeeded" | "failed";

export interface JournalArtifact {
  name: "compose";
  path: string;
  mediaType: string;
  sha256: string;
  bytes: number;
  recordedAt: string;
}

export interface JournalEvent {
  eventId: string;
  operationId: string;
  operationType: JournalOperationType;
  project: string;
  repository?: string;
  gitRef: string;
  environment?: string;
  profile?: string;
  component?: string;
  action?: string;
  adapter?: "ansible";
  status: JournalStatus;
  startedAt: string;
  endedAt: string;
  reason: string;
  artifacts?: JournalArtifact[];
}
