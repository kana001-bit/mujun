// Markdown の形だけで分かる跡: 番号付きリストの欠番、壊れた JSON の実例
import { defineRule } from "../define.ts";

export const listNumbering = defineRule({
  id: "list/numbering",
  description: "番号付きリストが連番になっている（項目を消した跡を拾う）",
  defaultOptions: undefined,
  check({ project, report }) {
    for (const doc of project.docs) {
      for (const list of doc.orderedLists) {
        const nums = list.items.map((i) => i.number);
        // 全部同じ番号（1. 1. 1.）は Markdown の自動採番に任せる書き方
        if (nums.length < 2 || nums.every((n) => n === nums[0])) continue;
        const start = nums[0] ?? 1;
        const want = nums.map((_, i) => start + i);
        const at = nums.findIndex((n, i) => n !== want[i]);
        if (at < 0) continue;
        report({
          doc,
          line: list.items[at]?.line ?? list.line,
          message: `番号が ${nums.join("・")}（期待 ${want.join("・")}）`,
        });
      }
    }
  },
  invalid: [
    {
      name: "手順を 1 つ消した",
      files: { "a.md": "1. 受け付ける\n2. 確認する\n4. 送る\n" },
    },
    {
      name: "番号が重なっている",
      files: { "a.md": "## 手順\n\n1. a\n2. b\n2. c\n" },
    },
  ],
  valid: [
    {
      name: "自動採番・入れ子・途中から始まる",
      files: {
        "a.md": "1. a\n1. b\n1. c\n\n---\n\n3. a\n4. b\n   1. x\n   2. y\n5. c\n",
      },
    },
  ],
});

export const jsonBlock = defineRule({
  id: "markdown/json-block",
  description: "```json のブロックが JSON として読める",
  defaultOptions: undefined,
  check({ project, report }) {
    for (const doc of project.docs) {
      for (const b of doc.codeBlocks) {
        if (b.lang !== "json") continue;
        try {
          JSON.parse(b.value);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          report({ doc, line: b.line, message: `json ブロックが読めない: ${message}` });
        }
      }
    }
  },
  invalid: [
    {
      name: "末尾のカンマ",
      files: { "a.md": '```json\n{ "a": 1, }\n```\n' },
    },
  ],
  valid: [
    {
      name: "正しい JSON と jsonc",
      files: { "a.md": '```json\n{ "a": [1, 2] }\n```\n\n```jsonc\n{ "a": 1, // c\n}\n```\n' },
    },
  ],
});
