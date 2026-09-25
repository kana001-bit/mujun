// 「通っていることは効いていることの証拠ではない」。各ルールが自分の壊れた例で本当に落ちるかを確かめる。
import { buildProject, mergeOptions, runRules } from "./engine.ts";
import type { AnyRule, RuleCase } from "./types.ts";

export type SelftestResult = { ruleId: string; ok: boolean; messages: string[] };

const run = (rule: AnyRule, c: RuleCase<unknown>): string[] => {
  const project = buildProject(new Map(Object.entries(c.files)));
  const options = mergeOptions(rule.defaultOptions, c.options);
  return runRules(project, [{ rule, severity: "error", options }]).map(
    (p) => `${p.path ?? ""}${p.line === undefined ? "" : `:${p.line}`} ${p.message}`,
  );
};

export const selftest = (rules: Iterable<AnyRule>): SelftestResult[] => {
  const results: SelftestResult[] = [];
  for (const rule of rules) {
    const messages: string[] = [];
    if (rule.invalid.length === 0)
      messages.push("壊れた例（invalid）が 1 つも無い。効いているか確かめられない");
    for (const c of rule.invalid) {
      if (run(rule, c).length === 0) messages.push(`invalid「${c.name}」が落ちなかった`);
    }
    for (const c of rule.valid ?? []) {
      const got = run(rule, c);
      if (got.length > 0) messages.push(`valid「${c.name}」が落ちた: ${got.join(" / ")}`);
    }
    results.push({ ruleId: rule.id, ok: messages.length === 0, messages });
  }
  return results;
};
