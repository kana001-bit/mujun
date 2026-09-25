// 本文で宣言した数（「集約 7 種」「24 テーブル」）と、実際に数えた数が一致するか。
// 宣言の文言を変えると正規表現が何にも当たらず、黙って通り続ける。
// なので宣言が見つからないことも、数える対象が見つからないことも報告する
import { matchesGlob } from "node:path";
import { defineRule } from "../define.ts";
import { proseLines } from "../markdown.ts";
import type { Project } from "../types.ts";

type CountOf =
  // ER 図のエンティティ（属性つきで定義したもの）
  | { entities: true }
  // 見出し行がこれで始まる表の行数（複数あれば合計）
  | { tableRows: string[]; file?: string }
  // 見出しの文字列がこの正規表現に当たる数
  | { headings: string; file?: string };

type Options = {
  declarations: {
    name: string;
    // 宣言の形。グループ 1 が数
    pattern: string;
    of: CountOf;
    // 宣言を探す文書（glob）。省くと全部
    files?: string[];
  }[];
};

const count = (project: Project, of: CountOf): number => {
  if ("entities" in of) {
    return [...project.er.entities.values()].filter((e) => e.attrs.length > 0).length;
  }
  const docs = project.docs.filter((d) => of.file === undefined || matchesGlob(d.path, of.file));
  if ("tableRows" in of) {
    return docs
      .flatMap((d) => d.tables)
      .filter((t) => of.tableRows.every((h, i) => t.header[i] === h))
      .reduce((n, t) => n + t.rows.length, 0);
  }
  const re = new RegExp(of.headings);
  return docs.flatMap((d) => d.headings).filter((h) => re.test(h.text)).length;
};

const describe = (of: CountOf): string => {
  if ("entities" in of) return "ER 図のエンティティ";
  if ("tableRows" in of) return `表「${of.tableRows.join(" | ")}」の行`;
  return `見出し /${of.headings}/`;
};

export default defineRule<Options>({
  id: "count/declared",
  description: "本文で宣言した数と、実際に数えた数が一致している",
  defaultOptions: { declarations: [] },
  check({ project, options, report }) {
    for (const d of options.declarations) {
      const actual = count(project, d.of);
      if (actual === 0) {
        report({
          message: `${d.name}: ${describe(d.of)}が見つからない（書き方を変えたなら設定も直す）`,
        });
        continue;
      }
      const re = new RegExp(d.pattern, "g");
      let found = 0;
      for (const doc of project.docs) {
        if (d.files !== undefined && !d.files.some((g) => matchesGlob(doc.path, g))) continue;
        for (const { text, line } of proseLines(doc)) {
          for (const m of text.matchAll(re)) {
            found++;
            const n = Number(m[1]);
            if (n !== actual) {
              report({
                doc,
                line,
                message: `「${m[0]}」と宣言しているが、${describe(d.of)}は ${actual}`,
              });
            }
          }
        }
      }
      if (found === 0) {
        report({
          message: `${d.name}: 宣言 /${d.pattern}/ が見つからない（文言を変えたなら設定も直す）`,
        });
      }
    }
  },
  invalid: [
    {
      name: "表の行を足したのに宣言が古い",
      files: {
        "design.md": [
          "集約は 2 種。",
          "",
          "| 集約 | 中身 |",
          "| --- | --- |",
          "| Order | 注文 |",
          "| Stock | 在庫 |",
          "| Invoice | 請求 |",
        ].join("\n"),
      },
      options: {
        declarations: [
          {
            name: "集約",
            pattern: String.raw`集約は (\d+) 種`,
            of: { tableRows: ["集約", "中身"] },
          },
        ],
      },
    },
    {
      name: "テーブルを消したのに宣言が古い",
      files: {
        "er.md":
          "3 テーブル。\n\n```mermaid\nerDiagram\n  A {\n    int id PK\n  }\n  B {\n    int id PK\n  }\n```\n",
      },
      options: {
        declarations: [
          { name: "テーブル", pattern: String.raw`(\d+) テーブル`, of: { entities: true } },
        ],
      },
    },
    {
      name: "宣言の文言を変えて当たらなくなった",
      files: { "design.md": "## 1. 注文\n\n## 2. 在庫\n\nモジュールは二つ。\n" },
      options: {
        declarations: [
          {
            name: "モジュール",
            pattern: String.raw`(\d+) モジュール`,
            of: { headings: String.raw`^\d+\. ` },
          },
        ],
      },
    },
  ],
  valid: [
    {
      name: "見出しを数える・宣言が 2 か所",
      files: {
        "a.md": "## 1. 注文\n\n## 2. 在庫\n\n2 モジュールで作る。\n",
        "b.md": "全体は 2 モジュール。\n",
      },
      options: {
        declarations: [
          {
            name: "モジュール",
            pattern: String.raw`(\d+) モジュール`,
            of: { headings: String.raw`^\d+\. `, file: "a.md" },
          },
        ],
      },
    },
  ],
});
