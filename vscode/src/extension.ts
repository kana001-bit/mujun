// VS Code 拡張の入口。設計書を保存するたびに mujun を走らせ、指摘を「問題」パネルと波線に出す。
// 走らせ方と出力の読み方は run.ts。ここは VS Code とのつなぎだけ。
import { dirname } from "node:path";
import * as vscode from "vscode";
import { type FileProblem, findCli, groupByFile, runMujun } from "./run.ts";

const CONFIG_GLOB = "**/mujun.config.{ts,mjs,js}";
const CONFIG_NAME = /(^|[\\/])mujun\.config\.(ts|mjs|js)$/;

const toDiagnostic = (p: FileProblem): vscode.Diagnostic => {
  // 指摘は行単位なので、行全体に波線を引く（列の終わりは VS Code が行の長さに丸める）
  const d = new vscode.Diagnostic(
    new vscode.Range(p.line, 0, p.line, Number.MAX_SAFE_INTEGER),
    p.message,
    p.severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
  );
  d.source = "mujun";
  d.code = p.ruleId;
  return d;
};

export const activate = (context: vscode.ExtensionContext): void => {
  const diagnostics = vscode.languages.createDiagnosticCollection("mujun");
  const output = vscode.window.createOutputChannel("mujun");
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  status.command = "mujun.showOutput";
  context.subscriptions.push(diagnostics, output, status);

  const check = async (): Promise<void> => {
    const node = vscode.workspace.getConfiguration("mujun").get<string>("nodePath", "node");
    const configs = await vscode.workspace.findFiles(CONFIG_GLOB, "**/node_modules/**");
    const next = new Map<string, vscode.Diagnostic[]>();
    const failures: string[] = [];
    for (const uri of configs) {
      const config = uri.fsPath;
      const cli = findCli(dirname(config));
      if (cli === undefined) {
        failures.push(`${config}: node_modules に mujun が無い（npm i -D mujun）`);
        continue;
      }
      const run = await runMujun({ node, cli, config });
      if (!run.ok) {
        failures.push(`${config}: ${run.message}`);
        continue;
      }
      for (const [file, problems] of groupByFile(run.result, config)) {
        next.set(file, [...(next.get(file) ?? []), ...problems.map(toDiagnostic)]);
      }
    }
    // 前回の指摘のうち、今回どの設定でも検査しなかったファイルの分も消す
    diagnostics.clear();
    for (const [file, list] of next) diagnostics.set(vscode.Uri.file(file), list);

    for (const f of failures) output.appendLine(f);
    if (failures.length > 0) {
      status.text = "$(warning) mujun";
      status.tooltip = "mujun を走らせられなかった。クリックで出力を開く";
      status.show();
    } else {
      status.hide();
    }
  };

  // 保存が続いても同時には 1 回だけ走らせ、走っている間の保存は終わったあとの 1 回にまとめる
  let running: Promise<void> | undefined;
  let again = false;
  const schedule = (): void => {
    if (running !== undefined) {
      again = true;
      return;
    }
    running = check()
      .catch((e: unknown) => {
        output.appendLine(e instanceof Error ? (e.stack ?? e.message) : String(e));
      })
      .finally(() => {
        running = undefined;
        if (again) {
          again = false;
          schedule();
        }
      });
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("mujun.run", schedule),
    vscode.commands.registerCommand("mujun.showOutput", () => {
      output.show();
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      // 設計書と設定ファイルの保存で走らせる。独自ルール（.ts）を直したときは「mujun: 検査する」で
      if (doc.languageId === "markdown" || CONFIG_NAME.test(doc.fileName)) schedule();
    }),
    // 削除・改名は保存イベントを伴わない。参照先の変更も検査し直し、元のパスの指摘を消す
    vscode.workspace.onDidDeleteFiles(schedule),
    vscode.workspace.onDidRenameFiles(schedule),
  );
  schedule();
};

export const deactivate = (): void => undefined;
