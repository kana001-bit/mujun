// 守る仕様: ファイルの削除・改名後に再検査し、元のパスの診断を消して現在のファイルに指摘を出す
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import type * as vscode from "vscode";
import type * as Extension from "../src/extension.ts";

const diagnostics = new Map<string, unknown[]>();
const messages: string[] = [];
const disposable = { dispose: () => undefined };
let deleted: (() => void) | undefined;
let renamed: (() => void) | undefined;
let finished: (() => void) | undefined;
let configs: { fsPath: string }[] = [];

function mockValue(): object {
  return {};
}

// VS Code の実行環境だけを置き換え、拡張の入口から実物の CLI・診断の更新まで通す
export const vscodeMock = {
  languages: {
    createDiagnosticCollection: () => ({
      ...disposable,
      clear: () => {
        diagnostics.clear();
      },
      set: (uri: { fsPath: string }, list: unknown[]) => diagnostics.set(uri.fsPath, list),
    }),
  },
  window: {
    createOutputChannel: () => ({
      ...disposable,
      appendLine: (message: string) => messages.push(message),
    }),
    createStatusBarItem: () => ({
      ...disposable,
      hide: () => finished?.(),
      show: () => finished?.(),
    }),
  },
  workspace: {
    getConfiguration: () => ({ get: () => process.execPath }),
    findFiles: () => Promise.resolve(configs),
    onDidSaveTextDocument: () => disposable,
    onDidDeleteFiles: (listener: () => void) => {
      deleted = listener;
      return disposable;
    },
    onDidRenameFiles: (listener: () => void) => {
      renamed = listener;
      return disposable;
    },
  },
  commands: { registerCommand: () => disposable },
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  Range: mockValue,
  Diagnostic: mockValue,
  DiagnosticSeverity: { Error: 0, Warning: 1 },
  StatusBarAlignment: { Left: 1 },
};

test(
  "拡張は、改名後に診断を新しいパスへ移し、削除後に診断を消す",
  { timeout: 10_000 },
  async (t) => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "mujun-extension-")));
    t.after(() => {
      rmSync(dir, { recursive: true, force: true });
    });
    const cliDir = join(dir, "node_modules", "mujun", "dist");
    mkdirSync(cliDir, { recursive: true });
    const repoCli = pathToFileURL(join(__dirname, "..", "..", "..", "src", "cli.ts"));
    writeFileSync(join(cliDir, "cli.js"), `import(${JSON.stringify(repoCli.href)});\n`);
    const config = join(dir, "mujun.config.mjs");
    writeFileSync(
      config,
      'export default { files: ["*.md"], rules: { "list/numbering": "error" } };\n',
    );
    configs = [{ fsPath: config }];
    const oldPath = join(dir, "old.md");
    const newPath = join(dir, "new.md");
    writeFileSync(oldPath, "1. 一\n3. 三\n");

    const mockUrl = pathToFileURL(join(__dirname, "vscode-mock.cjs")).href;
    const hooks = registerHooks({
      resolve: (specifier, context, next) =>
        specifier === "vscode" ? { url: mockUrl, shortCircuit: true } : next(specifier, context),
      load: (url, context, next) =>
        url === mockUrl
          ? {
              format: "commonjs",
              source: `module.exports = require(${JSON.stringify(__filename)}).vscodeMock;`,
              shortCircuit: true,
            }
          : next(url, context),
    });
    t.after(() => {
      hooks.deregister();
    });
    const extension = createRequire(__filename)("../src/extension.js") as typeof Extension;
    const subscriptions: vscode.Disposable[] = [];
    t.after(() => {
      for (const subscription of subscriptions) subscription.dispose();
    });
    const completed = (action: () => void): Promise<void> =>
      new Promise((resolve) => {
        finished = resolve;
        action();
      });

    await completed(() => {
      extension.activate({ subscriptions } as vscode.ExtensionContext);
    });
    assert.deepEqual(messages, []);
    assert.equal(diagnostics.get(oldPath)?.length, 1);
    assert.ok(renamed, "改名イベントを購読する");
    renameSync(oldPath, newPath);
    await completed(renamed);
    assert.deepEqual(messages, []);
    assert.equal(diagnostics.has(oldPath), false);
    assert.equal(diagnostics.get(newPath)?.length, 1);

    assert.ok(deleted, "削除イベントを購読する");
    rmSync(newPath);
    await completed(deleted);
    assert.deepEqual(messages, []);
    assert.equal(diagnostics.size, 0);
  },
);
