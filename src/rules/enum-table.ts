// 列挙表の値 ↔ 列コメントの値。同じ事実を 2 か所に書いているので、ずれたら止める。
// 1 行に複数の列を並べれば、それらの語彙が揃っていることも見る（片方だけ値を足した、を拾う）
import { defineRule } from "../define.ts";
import { cellValues, enumValues, findAttr } from "../er.ts";

type Options = {
  // 列挙表の見出し行（先頭から一致）。1 列目に `TABLE.column`、2 列目に値
  header: string[];
};

const same = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((v) => b.includes(v));

export default defineRule<Options>({
  id: "er/enum-table",
  description: "列挙表に書いた値と、ER 図の列コメントの値が一致している",
  defaultOptions: { header: ["列", "値"] },
  check({ project, options, report }) {
    // 図が 1 枚も無いプロジェクトでは何も言わない
    if (project.er.entities.size === 0) return;
    for (const doc of project.docs) {
      for (const t of doc.tables) {
        if (!options.header.every((h, i) => t.header[i] === h)) continue;
        for (const row of t.rows) {
          // ER 図の列の形（`ORDER.status`）だけを見る。`*_source` のような列を 1 つに決めない行や、
          // `config.port` のような ER 図と関係の無い値の表は拾わない
          const refs = cellValues(row.cells[0] ?? "").filter((r) =>
            /^[A-Z][A-Z0-9_]*\.[a-z_][a-z0-9_]*$/.test(r),
          );
          const values = cellValues(row.cells[1] ?? "");
          for (const ref of refs) {
            const attr = findAttr(project.er, ref);
            if (attr === undefined) {
              report({ doc, line: row.line, message: `列挙表の ${ref} が ER 図に無い` });
              continue;
            }
            const inComment = enumValues(attr.comment);
            if (inComment.length === 0) {
              report({
                doc,
                line: row.line,
                message: `${ref} の列コメントに「a / b」の形の値が無い`,
              });
            } else if (!same(values, inComment)) {
              report({
                doc,
                line: row.line,
                message: `${ref}: 列挙表 [${values.join(" ")}] と列コメント [${inComment.join(" ")}] が違う`,
              });
            }
          }
        }
      }
    }
  },
  invalid: [
    {
      name: "列コメントにだけ値を足した",
      files: {
        "er.md": [
          "```mermaid",
          "erDiagram",
          "  ORDER {",
          '    string status "draft / placed / shipped"',
          "  }",
          "```",
          "",
          "| 列 | 値 |",
          "| --- | --- |",
          "| `ORDER.status` | `draft` `placed` |",
        ].join("\n"),
      },
    },
    {
      name: "並べた 2 列の片方だけ値を足した",
      files: {
        "er.md": [
          "```mermaid",
          "erDiagram",
          "  PLAN {",
          '    string kind "a / b"',
          "  }",
          "  ACTUAL {",
          '    string kind "a / b / c"',
          "  }",
          "```",
          "",
          "| 列 | 値 |",
          "| --- | --- |",
          "| `PLAN.kind` `ACTUAL.kind` | `a` `b` |",
        ].join("\n"),
      },
    },
    {
      name: "列名が古い",
      files: {
        "er.md": [
          "```mermaid",
          "erDiagram",
          "  ORDER {",
          '    string status "a / b"',
          "  }",
          "```",
          "",
          "| 列 | 値 |",
          "| --- | --- |",
          "| `ORDER.state` | `a` `b` |",
        ].join("\n"),
      },
    },
  ],
  valid: [
    {
      name: "順序・前置き・補足・ワイルドカードの行",
      files: {
        "er.md": [
          "```mermaid",
          "erDiagram",
          "  ORDER {",
          '    string status "D3: placed / draft（既定）。説明"',
          "  }",
          "```",
          "",
          "| 列 | 値 | 出所 |",
          "| --- | --- | --- |",
          "| `ORDER.status` | draft / placed | D3 |",
          "| `*_source` | `entered` | D1 |",
        ].join("\n"),
      },
    },
    {
      name: "ER 図と関係の無い「列 | 値」の表",
      files: {
        "er.md": "```mermaid\nerDiagram\n  ORDER {\n    int id PK\n  }\n```\n",
        "ops.md": "| 列 | 値 |\n| --- | --- |\n| `config.port` | `8080` |\n",
      },
    },
    {
      name: "PascalCase の値",
      files: {
        "er.md": [
          "```mermaid",
          "erDiagram",
          "  DRAFT {",
          '    enum command_kind "PlaceOrder / CancelOrder"',
          "  }",
          "```",
          "",
          "| 列 | 値 |",
          "| --- | --- |",
          "| `DRAFT.command_kind` | `PlaceOrder` `CancelOrder` |",
        ].join("\n"),
      },
    },
  ],
});
