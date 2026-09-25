#!/usr/bin/env node
// mujun [check] [--config <path>] [--quiet]
// mujun selftest [--config <path>]
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { allRules, findConfig, loadConfig, readFiles, resolveRuns } from "./config.ts";
import { buildProject, runRules } from "./engine.ts";
import { builtinRules } from "./rules/index.ts";
import { selftest } from "./selftest.ts";
import type { Config } from "./types.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: "string", short: "c" },
    quiet: { type: "boolean", short: "q", default: false },
  },
});
const command = positionals[0] ?? "check";

const load = async (): Promise<{ config: Config; root: string } | undefined> => {
  const path = values.config ?? findConfig(process.cwd());
  if (path === undefined) return undefined;
  return { config: await loadConfig(path), root: dirname(path) };
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
  for (const p of problems) {
    if (values.quiet && p.severity !== "error") continue;
    const where =
      p.path === undefined ? "" : `${p.path}${p.line === undefined ? "" : `:${p.line}`}  `;
    console.error(
      `${where}${p.severity === "error" ? "error" : "warn "}  ${p.message}  ${p.ruleId}`,
    );
  }
  const errors = problems.filter((p) => p.severity === "error").length;
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

const commands: Record<string, () => Promise<number>> = { check, selftest: runSelftest };
const run = commands[command];
if (run === undefined) {
  console.error(`mujun: 知らないコマンド ${command}（check / selftest）`);
  process.exit(2);
}
process.exitCode = await run();
