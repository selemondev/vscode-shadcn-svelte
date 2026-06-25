import { spawn } from "node:child_process";
import * as vscode from "vscode";

export type CommandResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

/**
 * Run a shell command programmatically, streaming output to an OutputChannel, and resolve
 * once it exits. Unlike the terminal pipeline (which is fire-and-forget), this gives us a
 * completion signal and an exit code so callers can react to success/failure.
 */
export const runCommand = (
  command: string,
  cwd: string,
  outputChannel: vscode.OutputChannel,
): Promise<CommandResult> => {
  return new Promise((resolve, reject) => {
    outputChannel.appendLine(`$ ${command}`);

    const child = spawn(command, { cwd, shell: true });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      outputChannel.append(text);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      outputChannel.append(text);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
};
