// 守る仕様: 解析（Markdown・erDiagram）と selftest の土台
import assert from "node:assert/strict";
import { test } from "node:test";
import { defineRule } from "../src/define.ts";
import { buildProject } from "../src/engine.ts";
import { parseDoc } from "../src/markdown.ts";
import { builtinRules } from "../src/rules/index.ts";
import { selftest } from "../src/selftest.ts";

test("Markdown: 見出し・表・mermaid・インラインコードを行番号つきで読む", () => {
  const doc = parseDoc(
    "a.md",
    [
      "# 設計",
      "",
      "## ER",
      "",
      "| FK 列 | 参照先 |",
      "| --- | --- |",
      "| `buyer_id` | **`USER`** |",
      "",
      "```mermaid",
      "erDiagram",
      "  USER {",
      "  }",
      "```",
      "",
      "`USER.id` を使う。",
    ].join("\n"),
  );
  assert.deepEqual(
    doc.headings.map((h) => [h.depth, h.text, h.line]),
    [
      [1, "設計", 1],
      [2, "ER", 3],
    ],
  );
  assert.equal(doc.tables.length, 1);
  assert.deepEqual(doc.tables[0]?.header, ["FK 列", "参照先"]);
  assert.deepEqual(doc.tables[0].rows[0], { cells: ["`buyer_id`", "**`USER`**"], line: 7 });
  assert.equal(doc.tables[0].head, "ER");
  assert.equal(doc.mermaid[0]?.kind, "erDiagram");
  assert.equal(doc.mermaid[0].line, 10);
  assert.equal(doc.mermaid[0].head, "ER");
  // 表のセルの中のコードも本文として拾い、mermaid の中は拾わない
  assert.deepEqual(
    doc.codeSpans.map((s) => [s.value, s.line]),
    [
      ["buyer_id", 7],
      ["USER", 7],
      ["USER.id", 15],
    ],
  );
});

test("erDiagram: 多重度で親子を決め、属性の行番号を持つ", () => {
  const p = buildProject(
    new Map([
      [
        "er.md",
        [
          "```mermaid",
          "erDiagram",
          "  USER {",
          '    int id PK "主キー"',
          "  }",
          "  ORDER {",
          "    int user_id FK",
          "  }",
          "  ORDER }o..|| USER : places",
          "  USER ||--|| PROFILE : has",
          "```",
        ].join("\n"),
      ],
    ]),
  );
  const [rel, oneToOne] = p.er.relations;
  assert.deepEqual(
    [rel?.parent, rel?.child, rel?.dashed, rel?.ambiguous, rel?.line],
    ["USER", "ORDER", true, false, 9],
  );
  assert.equal(oneToOne?.ambiguous, true);
  const id = p.er.entities.get("USER")?.attrs[0];
  assert.deepEqual(
    [id?.name, [...(id?.keys ?? [])], id?.comment, id?.line],
    ["id", ["PK"], "主キー", 4],
  );
  assert.deepEqual(p.er.errors, []);
});

test("selftest: 組み込みルールは全部、自分の壊れた例で落ちる", () => {
  const failed = selftest(builtinRules).filter((r) => !r.ok);
  assert.deepEqual(failed, []);
});

test("selftest: 何も検査しないルールは失敗扱いになる", () => {
  const noop = defineRule({
    id: "test/noop",
    description: "何もしない",
    defaultOptions: undefined,
    check() {
      // 何も検査しない
    },
    invalid: [{ name: "壊れている", files: { "a.md": "# a\n" } }],
  });
  const noExamples = defineRule({ ...noop, id: "test/no-examples", invalid: [] });
  const results = selftest([noop, noExamples]);
  assert.deepEqual(
    results.map((r) => [r.ruleId, r.ok]),
    [
      ["test/noop", false],
      ["test/no-examples", false],
    ],
  );
});
