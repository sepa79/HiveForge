import { readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { CommandRunner } from "./command-runner.js";

const CHECKOUT_WORKTREE_DIR = ".checkout";

export async function gitCheckoutIntoWorkspace(input: {
  commandRunner: CommandRunner;
  repository: string;
  gitRef: string;
  workspacePath: string;
  sparsePaths?: readonly string[];
}): Promise<void> {
  const checkoutPath = path.join(input.workspacePath, CHECKOUT_WORKTREE_DIR);
  const cloneArgs = ["clone", "--no-checkout"];
  if (input.sparsePaths && input.sparsePaths.length > 0) {
    cloneArgs.push("--filter=blob:none", "--sparse");
  }
  cloneArgs.push(input.repository, checkoutPath);

  await input.commandRunner.run("git", cloneArgs);
  if (input.sparsePaths && input.sparsePaths.length > 0) {
    await input.commandRunner.run("git", ["sparse-checkout", "set", ...input.sparsePaths], { cwd: checkoutPath });
  }
  await input.commandRunner.run("git", ["checkout", input.gitRef], { cwd: checkoutPath });
  await moveCheckedOutRepository(checkoutPath, input.workspacePath);
}

async function moveCheckedOutRepository(checkoutPath: string, workspacePath: string): Promise<void> {
  const entries = await readdir(checkoutPath, { withFileTypes: true });
  for (const entry of entries) {
    await rename(path.join(checkoutPath, entry.name), path.join(workspacePath, entry.name));
  }
  await rm(checkoutPath, { recursive: true, force: false });
}
