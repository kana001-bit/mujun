// プロジェクトに入っている mujun の CLI を探して走らせ、`--format json` の出力を読む。
// VS Code に依存しない部分だけをここに置き、テストする。
//
// 拡張の中に mujun を同梱しないのは、利用者の設定ファイル（mujun.config.ts）と独自ルールが
// .ts のまま読まれるため。VS Code の Node はそれを読めないことがあり、版も選べない。
// プロジェクトの mujun をプロジェクトの Node で走らせれば、CI と同じ版・同じ結果になる。
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type Severity = "error" | "warn";

export type Problem = {
  ruleId: string;
  severity: Severity;
  message: string;
  path?: string;
  line?: number;
};

export type MujunResult = {
  root: string;
  files: string[];
  problems: Problem[];
};

/** 設定ファイルのディレクトリから上に向かって、node_modules/mujun の CLI を探す */
export const findCli = (from: string): string | undefined => {
  let dir = resolve(from);
  for (;;) {
    const cli = join(dir, "node_modules", "mujun", "dist", "cli.js");
    if (existsSync(cli)) return cli;
    const up = dirname(dir);
    if (up === dir) return undefined;
    dir = up;
  }
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isProblem = (v: unknown): v is Problem =>
  isRecord(v) &&
  typeof v["ruleId"] === "string" &&
  (v["severity"] === "error" || v["severity"] === "warn") &&
  typeof v["message"] === "string" &&
  (v["path"] === undefined || typeof v["path"] === "string") &&
  (v["line"] === undefined || typeof v["line"] === "number");

/** `mujun --format json` の出力を読む。知らない形なら、何が違うかを書いて投げる */
export const parseOutput = (stdout: string): MujunResult => {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    throw new Error(`mujun の出力が JSON ではない: ${stdout.slice(0, 200)}`);
  }
  if (!isRecord(json)) throw new Error("mujun の出力がオブジェクトではない");
  // version が上がったら（形が変わったら）、黙って読み違えずに拡張の更新を促す
  if (json["version"] !== 1) {
    throw new Error(
      `mujun の出力の version ${String(json["version"])} を読めない（拡張を更新する）`,
    );
  }
  const { root, files, problems } = json;
  if (typeof root !== "string") throw new Error("mujun の出力に root が無い");
  if (!Array.isArray(files) || !files.every((f) => typeof f === "string")) {
    throw new Error("mujun の出力の files が文字列の配列ではない");
  }
  if (!Array.isArray(problems) || !problems.every(isProblem)) {
    throw new Error("mujun の出力の problems が読めない");
  }
  return { root, files, problems };
};

export type FileProblem = { line: number; severity: Severity; message: string; ruleId: string };

/**
 * 指摘をファイルの絶対パスごとに分ける。検査したファイルは、指摘が無くても空の配列で入れる
 * （前回の指摘を消すため）。path の無い指摘は設定ファイルに付ける。line は 0 始まりに直す
 */
export const groupByFile = (
  result: MujunResult,
  configPath: string,
): Map<string, FileProblem[]> => {
  const byFile = new Map<string, FileProblem[]>();
  for (const f of result.files) byFile.set(resolve(result.root, f), []);
  for (const p of result.problems) {
    const file = p.path === undefined ? resolve(configPath) : resolve(result.root, p.path);
    const list = byFile.get(file) ?? [];
    list.push({
      line: Math.max(0, (p.line ?? 1) - 1),
      severity: p.severity,
      message: p.message,
      ruleId: p.ruleId,
    });
    byFile.set(file, list);
  }
  return byFile;
};

export type RunResult = { ok: true; result: MujunResult } | { ok: false; message: string };

/** CLI を走らせる。終了コード 0（指摘なし・warn だけ）と 1（error あり）は結果、それ以外は失敗 */
export const runMujun = (opts: {
  node: string;
  cli: string;
  config: string;
  timeout?: number;
}): Promise<RunResult> =>
  new Promise((done) => {
    const timeout = opts.timeout ?? 120_000;
    execFile(
      opts.node,
      [opts.cli, "--config", opts.config, "--format", "json"],
      { cwd: dirname(opts.config), maxBuffer: 64 * 1024 * 1024, timeout },
      (error, stdout, stderr) => {
        // --format json は mujun 0.2.0 から。古い mujun は知らないオプションで落ちる
        if (stderr.includes("Unknown option '--format'")) {
          done({
            ok: false,
            message: "この拡張には mujun 0.2.0 以上が要る（npm i -D mujun@latest）",
          });
          return;
        }
        // 打ち切ったときは code が null になる。理由が「null」では分からないので、時間で書く
        if (error?.killed === true) {
          done({
            ok: false,
            message: `mujun が ${String(timeout / 1000)} 秒で終わらず、打ち切った`,
          });
          return;
        }
        const code = error === null ? 0 : error.code;
        if (code !== 0 && code !== 1) {
          const why = stderr.trim() === "" ? (error?.message ?? "") : stderr.trim();
          done({ ok: false, message: `mujun が失敗した（${String(code)}）: ${why}` });
          return;
        }
        try {
          done({ ok: true, result: parseOutput(stdout) });
        } catch (e) {
          const why = e instanceof Error ? e.message : String(e);
          done({ ok: false, message: stderr.trim() === "" ? why : `${why}\n${stderr.trim()}` });
        }
      },
    );
  });
