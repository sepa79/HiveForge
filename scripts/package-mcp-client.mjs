import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePackageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const packageName = "hiveforge-mcp-client";
const stagingDir = path.join(repoRoot, "dist", packageName);
const outputDir = path.join(repoRoot, "dist", "packages");

const requiredBuildOutputs = [
  "dist/src/client/hf-target.js",
  "dist/src/client/hiveforge-mcp-target.js",
  "dist/src/client/known-hiveforges.js",
  "dist/src/mcp/api-client.js",
  "dist/src/mcp/runtime.js",
  "dist/src/mcp/server.js",
  "dist/src/app-info.js"
];

for (const relativePath of requiredBuildOutputs) {
  if (!existsSync(path.join(repoRoot, relativePath))) {
    throw new Error(`Missing build output for MCP client package: ${relativePath}`);
  }
}

rmSync(stagingDir, { force: true, recursive: true });
mkdirSync(path.join(stagingDir, "dist", "src"), { recursive: true });
mkdirSync(outputDir, { recursive: true });

cpSync(path.join(repoRoot, "dist", "src", "client"), path.join(stagingDir, "dist", "src", "client"), {
  recursive: true
});
cpSync(path.join(repoRoot, "dist", "src", "mcp"), path.join(stagingDir, "dist", "src", "mcp"), {
  recursive: true
});
cpSync(path.join(repoRoot, "dist", "src", "app-info.js"), path.join(stagingDir, "dist", "src", "app-info.js"));

writeFileSync(
  path.join(stagingDir, "package.json"),
  `${JSON.stringify(
    {
      name: packageName,
      version: sourcePackageJson.version,
      private: true,
      license: sourcePackageJson.license,
      type: "module",
      bin: {
        "hf-target": "dist/src/client/hf-target.js",
        "hiveforge-mcp-target": "dist/src/client/hiveforge-mcp-target.js",
        "hiveforge-mcp": "dist/src/mcp/server.js"
      },
      files: ["dist/src/client", "dist/src/mcp", "dist/src/app-info.js", "README.md"],
      dependencies: sourcePackageJson.dependencies,
      engines: sourcePackageJson.engines
    },
    null,
    2
  )}\n`
);

writeFileSync(
  path.join(stagingDir, "README.md"),
  [
    "# HiveForge MCP Client",
    "",
    "This package contains the client-side HiveForge MCP stdio server and target selector CLIs.",
    "",
    "Binaries:",
    "",
    "- `hiveforge-mcp`",
    "- `hiveforge-mcp-target`",
    "- `hf-target`",
    ""
  ].join("\n")
);

const packResult = spawnSync("npm", ["pack", stagingDir, "--pack-destination", outputDir], {
  cwd: repoRoot,
  stdio: "inherit"
});

if (packResult.status !== 0) {
  throw new Error(`npm pack failed with status ${packResult.status ?? "unknown"}`);
}
