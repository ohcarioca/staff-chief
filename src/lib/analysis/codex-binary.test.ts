import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveCodexBinary } from "./codex-binary";

let home: string;
beforeEach(async () => { home = await fs.mkdtemp(path.join(os.tmpdir(), "codex-resolution-")); });
afterEach(async () => { await fs.rm(home, { recursive: true, force: true }); });
async function file(relative: string) {
  const target = path.join(home, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, "synthetic executable placeholder");
  return target;
}
describe("Codex executable resolution", () => {
  it("respects an explicit executable override", async () => {
    expect(await resolveCodexBinary({ platform: "win32", home, env: { CODEX_BIN: "D:/Codex/codex.exe" } })).toBe("D:/Codex/codex.exe");
  });
  it("uses the server PATH case-insensitively before looking for extensions", async () => {
    const binary = await file("path with spaces/codex.exe");
    expect(await resolveCodexBinary({ platform: "win32", home, env: { Path: `"${path.dirname(binary)}"` } })).toBe(binary);
  });
  it("finds the latest installed VS Code Codex when the server PATH lacks it", async () => {
    const platform = process.arch === "arm64" ? "windows-aarch64" : "windows-x86_64";
    await file(`.vscode/extensions/openai.chatgpt-2.9/bin/${platform}/codex.exe`);
    const latest = await file(`.vscode/extensions/openai.chatgpt-2.10/bin/${platform}/codex.exe`);
    expect(await resolveCodexBinary({ platform: "win32", home, env: {} })).toBe(latest);
  });
  it("retains normal process lookup when no executable is installed or on Unix", async () => {
    expect(await resolveCodexBinary({ platform: "win32", home, env: {} })).toBe("codex");
    expect(await resolveCodexBinary({ platform: "linux", home, env: {} })).toBe("codex");
  });
});
