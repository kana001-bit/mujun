// 「通っていることは効いていることの証拠ではない」。各ルールが自分の壊れた例で本当に落ちるかを確かめる。
import { buildProject, mergeOptions, runRules } from "./engine.ts";
import type { AnyRule, RuleCase } from "./types.ts";

export type SelftestResult = { ruleId: string; ok: boolean; messages: string[] };

// 実物の設計書（mutate の例に使う）と、設定ファイルで渡したルールの options
export type SelftestProject = {
  files: ReadonlyMap<string, string>;
  options: ReadonlyMap<string, unknown>;
};

const messagesOf = (
  rule: AnyRule,
  files: ReadonlyMap<string, string>,
  options: unknown,
): string[] =>
  runRules(buildProject(files), [{ rule, severity: "error", options }]).map(
    (p) => `${p.path ?? ""}${p.line === undefined ? "" : `:${p.line}`} ${p.message}`,
  );

// 行番号を落とした報告。書き換えで行がずれても、同じ報告は同じと数える
const withoutLine = (m: string): string => m.replace(/^([^ ]*?):\d+ /, "$1 ");

type Outcome = { reports: string[] } | { error: string };

const run = (
  rule: AnyRule,
  c: RuleCase<unknown>,
  project: SelftestProject | undefined,
): Outcome => {
  // 例文は自己完結しているので defaultOptions で走らせる。実物を壊す例はそのプロジェクトの設定で
  if ("files" in c) {
    const options = mergeOptions(rule.defaultOptions, c.options);
    return { reports: messagesOf(rule, new Map(Object.entries(c.files)), options) };
  }
  const options = mergeOptions(project?.options.get(rule.id) ?? rule.defaultOptions, c.options);
  if (project === undefined) {
    return { error: "mutate の例は、設定ファイルのあるプロジェクトでしか確かめられない" };
  }
  const files = new Map(project.files);
  for (const [path, f] of Object.entries(c.mutate)) {
    const before = files.get(path);
    if (before === undefined) return { error: `mutate の対象 ${path} が設定の files に無い` };
    const after = f(before);
    if (after === before) {
      return { error: `mutate が ${path} を変えなかった（元の文言が変わった？）` };
    }
    files.set(path, after);
  }
  // 元から出ている報告は数えない。書き換えで新しく出たものだけ
  const already = new Set(messagesOf(rule, project.files, options).map(withoutLine));
  return {
    reports: messagesOf(rule, files, options).filter((m) => !already.has(withoutLine(m))),
  };
};

export const selftest = (rules: Iterable<AnyRule>, project?: SelftestProject): SelftestResult[] => {
  const results: SelftestResult[] = [];
  for (const rule of rules) {
    const messages: string[] = [];
    if (rule.invalid.length === 0)
      messages.push("壊れた例（invalid）が 1 つも無い。効いているか確かめられない");
    for (const c of rule.invalid) {
      const o = run(rule, c, project);
      if ("error" in o) messages.push(`invalid「${c.name}」: ${o.error}`);
      else if (o.reports.length === 0) messages.push(`invalid「${c.name}」が落ちなかった`);
    }
    for (const c of rule.valid ?? []) {
      const o = run(rule, c, project);
      if ("error" in o) messages.push(`valid「${c.name}」: ${o.error}`);
      else if (o.reports.length > 0) {
        messages.push(`valid「${c.name}」が落ちた: ${o.reports.join(" / ")}`);
      }
    }
    results.push({ ruleId: rule.id, ok: messages.length === 0, messages });
  }
  return results;
};
