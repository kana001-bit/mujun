#!/usr/bin/env node
// mujun [check] [--config <path>] [--quiet] [--format text|json]
// mujun selftest [--config <path>]
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { allRules, findConfig, loadConfig, readFiles, resolveRuns } from "./config.ts";
import { buildProject, runRules } from "./engine.ts";
import { builtinRules } from "./rules/index.ts";
import { selftest } from "./selftest.ts";
import type { Config } from "./types.ts";

// 走らせられなかったときは終了コード 2。1（error の指摘あり）と見分けられるようにする（拡張などが読む）
const fail = (message: string): never => {
  console.error(`mujun: ${message}`);
  process.exit(2);
};

const parse = () => {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        config: { type: "string", short: "c" },
        quiet: { type: "boolean", short: "q", default: false },
        format: { type: "string", short: "f", default: "text" },
      },
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
};
const { values, positionals } = parse();
const command = positionals[0] ?? "check";
const FORMATS = ["text", "json"];

const load = async (): Promise<{ config: Config; root: string } | undefined> => {
  const path = values.config ?? findConfig(process.cwd());
  if (path === undefined) return undefined;
  return { config: await loadConfig(path), root: dirname(resolve(path)) };
};

const check = async (): Promise<number> => {
  const loaded = await load();
  if (loaded === undefined) {
    console.error("mujun: mujun.config.ts が見つからない");
    return 2;
  }
  const { config, root } = loaded;
  const files = readFiles(config, root);
  const problems = runRules(buildProject(files), resolveRuns(config));
  const errors = problems.filter((p) => p.severity === "error").length;
  const shown = values.quiet ? problems.filter((p) => p.severity === "error") : problems;
  if (values.format === "json") {
    // エディタ拡張などの機械が読む形。キーは利用者のツールが読むので変えない（足すのはよい）。
    // path は root からの相対（/ 区切り）。root は設定ファイルのディレクトリの絶対パス
    console.log(JSON.stringify({ version: 1, root, files: [...files.keys()], problems: shown }));
    return errors > 0 ? 1 : 0;
  }
  for (const p of shown) {
    const where =
      p.path === undefined ? "" : `${p.path}${p.line === undefined ? "" : `:${p.line}`}  `;
    console.error(
      `${where}${p.severity === "error" ? "error" : "warn "}  ${p.message}  ${p.ruleId}`,
    );
  }
  const warns = problems.length - errors;
  // --quiet では warn だけのときは何も出さない（フックで毎回走らせても静かにする）
  if (errors > 0 || (!values.quiet && warns > 0)) {
    console.error(`mujun: error ${errors} / warn ${warns}`);
  } else if (!values.quiet) console.log(`mujun: ok — ${files.size} files`);
  return errors > 0 ? 1 : 0;
};

const runSelftest = async (): Promise<number> => {
  const loaded = await load();
  const rules = loaded === undefined ? builtinRules : [...allRules(loaded.config).values()];
  const project =
    loaded === undefined
      ? undefined
      : {
          files: readFiles(loaded.config, loaded.root),
          options: new Map(resolveRuns(loaded.config).map((r) => [r.rule.id, r.options] as const)),
        };
  const results = selftest(rules, project);
  for (const r of results) {
    if (r.ok) {
      if (!values.quiet) console.log(`ok    ${r.ruleId}`);
      continue;
    }
    console.error(`FAIL  ${r.ruleId}`);
    for (const m of r.messages) console.error(`        ${m}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.error(
    `mujun selftest: ${results.length - failed}/${results.length} rules fail on their broken examples`,
  );
  return failed > 0 ? 1 : 0;
};

if (!FORMATS.includes(values.format)) {
  fail(`知らない --format ${values.format}（${FORMATS.join(" / ")}）`);
}
// selftest の結果に JSON の形は無い。黙ってテキストを出すと、読む側が JSON として読み違える
if (command === "selftest" && values.format !== "text") {
  fail(`selftest は --format ${values.format} に対応していない`);
}

const commands: Record<string, () => Promise<number>> = { check, selftest: runSelftest };
const run = commands[command] ?? fail(`知らないコマンド ${command}（check / selftest）`);
try {
  process.exitCode = await run();
} catch (e) {
  // 設定ファイルが読めない・ルールが投げた、など
  fail(e instanceof Error ? (e.stack ?? e.message) : String(e));
}
