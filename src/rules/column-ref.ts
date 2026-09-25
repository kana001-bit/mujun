// 本文に書いた `TABLE.column` と `TABLE` が ER 図に実在するか。図を直して本文が古いまま、を拾う。
import { matchesGlob } from "node:path";
import { defineRule } from "../define.ts";

type Options = {
  // エンティティ名とみなす形。既定は大文字スネーク（USER, ORDER_LINE）
  entityPattern: string;
  // `TABLE`（列なし）を見る範囲。underscore: 下線を含む名前だけ（`API` のような略語を拾わない）
  bareEntity: "all" | "underscore" | "none";
  allow: string[];
  // 当時の名前を残す記録（設計の履歴など）は見ない
  ignoreFiles: string[];
};

export default defineRule<Options>({
  id: "prose/column-ref",
  description: "本文の `TABLE.column` と `TABLE` が ER 図に実在する",
  defaultOptions: {
    entityPattern: "[A-Z][A-Z0-9_]*",
    bareEntity: "underscore",
    allow: ["PK", "FK", "UK", "NULL", "TABLE", "ENTITY"],
    ignoreFiles: [],
  },
  check({ project, options, report }) {
    const { entities } = project.er;
    // 図が 1 枚も無いプロジェクトでは何も言わない
    if (entities.size === 0) return;
    const re = new RegExp(`^(${options.entityPattern})(?:\\.([a-z_][a-z0-9_]*))?$`);
    for (const doc of project.docs) {
      if (options.ignoreFiles.some((g) => matchesGlob(doc.path, g))) continue;
      for (const s of doc.codeSpans) {
        const m = re.exec(s.value);
        const table = m?.[1];
        if (table === undefined || options.allow.includes(table)) continue;
        const col = m?.[2];
        if (col === undefined) {
          if (options.bareEntity === "none") continue;
          if (options.bareEntity === "underscore" && !table.includes("_")) continue;
        }
        const e = entities.get(table);
        if (e === undefined) {
          report({ doc, line: s.line, message: `\`${s.value}\`: ${table} が ER 図に無い` });
        } else if (
          col !== undefined &&
          e.attrs.length > 0 &&
          !e.attrs.some((a) => a.name === col)
        ) {
          report({ doc, line: s.line, message: `\`${s.value}\`: ${table} に ${col} が無い` });
        }
      }
    }
  },
  invalid: [
    {
      name: "列名が古い",
      files: {
        "er.md":
          "```mermaid\nerDiagram\n  USER {\n    int id PK\n    string display_name\n  }\n```\n",
        "design.md": "`USER.name` を表示する。\n",
      },
    },
    {
      name: "テーブル名が古い",
      files: {
        "er.md": "```mermaid\nerDiagram\n  ORDER_LINE {\n    int id PK\n  }\n```\n",
        "design.md": "| 表 | 役割 |\n| --- | --- |\n| `ORDER_ITEM` | 明細 |\n",
      },
    },
  ],
  valid: [
    {
      name: "略語・図の中・ignoreFiles",
      files: {
        "er.md":
          "```mermaid\nerDiagram\n  USER {\n    int id PK\n  }\n```\n\n`API` と `USER.id`。\n",
        "history.md": "昔は `OLD_USER` だった。\n",
      },
      options: { ignoreFiles: ["history.md"] },
    },
  ],
});
