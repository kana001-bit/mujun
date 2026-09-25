// 設計書一式を Project にし、ルールを走らせて Problem を集める。
import { buildErModel } from "./er.ts";
import { parseDoc } from "./markdown.ts";
import type { AnyRule, Doc, Problem, Project, Report, Severity } from "./types.ts";

export const buildProject = (files: ReadonlyMap<string, string>): Project => {
  const docs: Doc[] = [...files].map(([path, text]) => parseDoc(path, text));
  const byPath = new Map(docs.map((d) => [d.path, d] as const));
  return { docs, doc: (p) => byPath.get(p), er: buildErModel(docs) };
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// 設定で渡したオプションを defaultOptions に上書きで混ぜる。オブジェクトでなければ置き換える
export const mergeOptions = (defaults: unknown, override: unknown): unknown => {
  if (override === undefined) return defaults;
  if (isPlainObject(defaults) && isPlainObject(override)) return { ...defaults, ...override };
  return override;
};

export type RuleRun = { rule: AnyRule; severity: Exclude<Severity, "off">; options: unknown };

const toProblem = (run: RuleRun, r: Report): Problem => {
  const path = typeof r.doc === "string" ? r.doc : r.doc?.path;
  return {
    ruleId: run.rule.id,
    severity: run.severity,
    message: r.message,
    ...(path === undefined ? {} : { path }),
    ...(r.line === undefined ? {} : { line: r.line }),
  };
};

export const runRules = (project: Project, runs: readonly RuleRun[]): Problem[] => {
  const problems: Problem[] = [];
  for (const run of runs) {
    try {
      run.rule.check({
        project,
        options: run.options,
        report: (r) => problems.push(toProblem(run, r)),
      });
    } catch (e) {
      problems.push({
        ruleId: run.rule.id,
        severity: "error",
        message: `ルールが例外を投げた: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
  return problems.sort(
    (a, b) =>
      (a.path ?? "").localeCompare(b.path ?? "") ||
      (a.line ?? 0) - (b.line ?? 0) ||
      a.ruleId.localeCompare(b.ruleId),
  );
};
