// mujun.config.ts を探して読み、走らせるルールと対象ファイルに解決する。
import { existsSync, globSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { mergeOptions, type RuleRun } from "./engine.ts";
import { builtinRules } from "./rules/index.ts";
import type { AnyRule, Config, RuleSetting, Severity } from "./types.ts";

export const CONFIG_NAMES = ["mujun.config.ts", "mujun.config.mjs", "mujun.config.js"];

export const findConfig = (from: string): string | undefined => {
  let dir = resolve(from);
  for (;;) {
    for (const n of CONFIG_NAMES) {
      const p = join(dir, n);
      if (existsSync(p)) return p;
    }
    const up = dirname(dir);
    if (up === dir) return undefined;
    dir = up;
  }
};

export const loadConfig = async (path: string): Promise<Config> => {
  const mod = (await import(pathToFileURL(path).href)) as { default?: Config };
  if (mod.default === undefined) throw new Error(`${path}: export default が無い`);
  return mod.default;
};

export const allRules = (config: Config): Map<string, AnyRule> => {
  const rules = new Map<string, AnyRule>();
  for (const r of [...builtinRules, ...(config.plugins ?? [])]) {
    if (rules.has(r.id)) throw new Error(`ルール ${r.id} が 2 回定義されている`);
    rules.set(r.id, r);
  }
  return rules;
};

const normalize = (s: RuleSetting): [Severity, unknown] =>
  typeof s === "string" ? [s, undefined] : [s[0], s[1]];

export const resolveRuns = (config: Config): RuleRun[] => {
  const rules = allRules(config);
  const runs: RuleRun[] = [];
  for (const [id, setting] of Object.entries(config.rules)) {
    const rule = rules.get(id);
    if (rule === undefined) throw new Error(`rules に書いた ${id} というルールが無い`);
    const [severity, options] = normalize(setting);
    if (severity === "off") continue;
    runs.push({
      rule,
      severity,
      options: mergeOptions(rule.defaultOptions, options),
    });
  }
  return runs;
};

// config のディレクトリからの相対パス（/ 区切り）→ 中身
export const readFiles = (config: Config, root: string): Map<string, string> => {
  const paths = globSync(config.files, { cwd: root, exclude: config.ignores ?? [] });
  const files = new Map<string, string>();
  for (const p of [...paths].sort()) {
    const rel = relative(root, resolve(root, p)).split(sep).join("/");
    files.set(rel, readFileSync(join(root, rel), "utf8"));
  }
  return files;
};
