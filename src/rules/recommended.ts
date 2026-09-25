import type { RuleSetting } from "../types.ts";

// どのプロジェクトでも誤検知しにくいものだけ。設定を渡さないと意味を持たないルールはここに入れない
const recommended: Record<string, RuleSetting> = {
  "mermaid/er-syntax": "error",
  "er/relation-fk": "error",
  "er/duplicate-entity": "error",
  "er/isolated-entity": "warn",
  "prose/column-ref": "error",
  "ref/section": "error",
  "list/numbering": "error",
  "markdown/json-block": "error",
  // 似ているだけの文も拾うので warn
  "prose/duplicate": "warn",
};

export default recommended;
