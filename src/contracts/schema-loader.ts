import type { ErrorObject, ValidateFunction } from "ajv";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import YAML from "yaml";

const SCHEMA_ROOT = path.resolve("docs/specs");
const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020.js") as new (options: {
  allErrors: boolean;
  strict: boolean;
}) => {
  compile(schema: unknown): ValidateFunction;
};
const addFormats = require("ajv-formats") as (ajv: unknown) => void;

export const schemaPaths = {
  manifest: path.join(SCHEMA_ROOT, "manifest.schema.json"),
  projectRegistry: path.join(SCHEMA_ROOT, "config/project-registry.schema.json"),
  environments: path.join(SCHEMA_ROOT, "config/environments.schema.json"),
  runtimeEnv: path.join(SCHEMA_ROOT, "config/runtime-env.schema.json"),
  journalEvent: path.join(SCHEMA_ROOT, "journal/event.schema.json")
} as const;

export class ContractValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: ErrorObject[]
  ) {
    super(message);
    this.name = "ContractValidationError";
  }
}

export async function loadYamlFile(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf8");
  return YAML.parse(raw);
}

export async function loadJsonFile(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function buildContractValidator(schemaPath: string): Promise<ValidateFunction> {
  const schema = await loadJsonFile(schemaPath);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

export async function validateContract(schemaPath: string, value: unknown): Promise<void> {
  const validate = await buildContractValidator(schemaPath);
  if (!validate(value)) {
    throw new ContractValidationError("Contract validation failed", validate.errors ?? []);
  }
}
