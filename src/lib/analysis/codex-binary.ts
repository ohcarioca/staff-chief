import "server-only";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function resolveCodexBinary({ platform = process.platform, env = process.env, home = os.homedir() }: {
  platform?: NodeJS.Platform; env?: Record<string, string | undefined>; home?: string;
} = {}): Promise<string> {
  if (env.CODEX_BIN) return env.CODEX_BIN;
  if (platform !== "win32") return "codex";
  const exists = async (candidate: string) => {
    try { return (await fs.stat(candidate)).isFile(); } catch { return false; }
  };
  const executablePath = Object.entries(env).find(([key]) => key.toLowerCase() === "path")?.[1] ?? "";
  for (const directory of executablePath.split(";").filter(Boolean)) {
    const candidate = path.join(directory.replace(/^"|"$/g, ""), "codex.exe");
    if (await exists(candidate)) return candidate;
  }
  // VS Code's terminal can have a different PATH from the local application server.
  const extensions = path.join(home, ".vscode", "extensions");
  const entries = await fs.readdir(extensions, { withFileTypes: true }).catch(() => []);
  const installations = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("openai.chatgpt-"))
    .sort((a, b) => b.name.localeCompare(a.name, "en", { numeric: true }));
  for (const installation of installations) {
    const candidate = path.join(extensions, installation.name, "bin", process.arch === "arm64" ? "windows-aarch64" : "windows-x86_64", "codex.exe");
    if (await exists(candidate)) return candidate;
  }
  return "codex";
}
