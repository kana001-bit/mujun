// 参照の宙づり: 節を消したり番号を振り直したりすると、それを指していた参照が宙に浮く
import { matchesGlob } from "node:path";
import { defineRule } from "../define.ts";
import { proseLines } from "../markdown.ts";
import type { Doc } from "../types.ts";

type SectionOptions = {
  // 参照の形。グループ 1 が節番号
  ref: string;
  // 番号つき見出しの形（見出しの文字列に当てる）。グループ 1 が節番号
  heading: string;
};

export const section = defineRule<SectionOptions>({
  id: "ref/section",
  description: "本文の §N.N が、同じ文書に実在する節を指している",
  defaultOptions: {
    ref: String.raw`§(\d+(?:\.\d+)*)`,
    heading: String.raw`^(\d+(?:\.\d+)*)(?:[ .．、:：]|$)`,
  },
  check({ project, options, report }) {
    const refRe = new RegExp(options.ref, "g");
    const headRe = new RegExp(options.heading);
    for (const doc of project.docs) {
      const defined = new Set<string>();
      for (const h of doc.headings) {
        const n = headRe.exec(h.text)?.[1];
        if (n === undefined) continue;
        // 4.2 があれば §4 も指せる
        const parts = n.split(".");
        for (let i = 1; i <= parts.length; i++) defined.add(parts.slice(0, i).join("."));
      }
      // 番号つきの見出しが無い文書の § は、外の文書（法令など）を指していると読む
      if (defined.size === 0) continue;
      for (const { text, line } of proseLines(doc)) {
        for (const m of text.matchAll(refRe)) {
          const n = m[1];
          if (n !== undefined && !defined.has(n)) {
            report({ doc, line, message: `${m[0]} という節が無い` });
          }
        }
      }
    }
  },
  invalid: [
    {
      name: "消した節を指している",
      files: { "a.md": "## 1. 概要\n\n§2 を見る。\n\n## 3. 詳細\n" },
    },
    {
      name: "小節の番号が古い",
      files: { "a.md": "## 4. 設計\n\n### 4.1 集約\n\n§4.2 のとおり。\n" },
    },
  ],
  valid: [
    {
      name: "親の番号・コードの中・番号つき見出しの無い文書",
      files: {
        "a.md": "## 4. 設計\n\n### 4.1 集約\n\n§4 と §4.1。\n\n```\n§9\n```\n",
        "b.md": "# メモ\n\n民法 §90。\n",
      },
    },
  ],
});

type IdOptions = {
  ids: {
    // 報告に使う名前
    name: string;
    // 参照の形。グループ 1 が ID
    ref: string;
    // 定義の形。見出しの文字列と、表の各行の 1 列目に当てる。グループ 1 が ID
    def: string;
  }[];
  ignoreFiles: string[];
};

export const id = defineRule<IdOptions>({
  id: "ref/id",
  description: "D12 や U3 のような ID の参照が、どこかで定義されている",
  defaultOptions: { ids: [], ignoreFiles: [] },
  check({ project, options, report }) {
    const docs = project.docs.filter(
      (d) => !options.ignoreFiles.some((g) => matchesGlob(d.path, g)),
    );
    for (const kind of options.ids) {
      const defRe = new RegExp(kind.def);
      const refRe = new RegExp(kind.ref, "g");
      const defined = new Set<string>();
      const define = (s: string): void => {
        const k = defRe.exec(s)?.[1];
        if (k !== undefined) defined.add(k);
      };
      // 定義は ignoreFiles の中にあってもよい
      for (const d of project.docs) {
        for (const h of d.headings) define(h.text);
        for (const t of d.tables) for (const r of t.rows) define(r.cells[0] ?? "");
      }
      const scan = (doc: Doc): void => {
        for (const { text, line } of proseLines(doc)) {
          for (const m of text.matchAll(refRe)) {
            const k = m[1];
            if (k !== undefined && !defined.has(k)) {
              report({ doc, line, message: `${m[0]}: ${kind.name} ${k} が定義されていない` });
            }
          }
        }
      };
      docs.forEach(scan);
    }
  },
  invalid: [
    {
      name: "消した判断を指している",
      files: {
        "design.md": "### D1. 金額は整数\n\n### D3. 差分は導出\n\nD2 に従う。\n",
      },
      options: {
        ids: [{ name: "設計判断", ref: String.raw`\bD(\d+)\b`, def: String.raw`^D(\d+)\.` }],
      },
    },
    {
      name: "表で定義する ID",
      files: {
        "design.md": "| ID | 未決事項 |\n| --- | --- |\n| U1 | 締め日 |\n\nU2 は保留。\n",
      },
      options: {
        ids: [{ name: "未決事項", ref: String.raw`\bU(\d+)\b`, def: String.raw`^U(\d+)$` }],
      },
    },
  ],
  valid: [
    {
      name: "別の文書から参照",
      files: {
        "design.md": "### D1. 金額は整数\n",
        "er.md": "金額は int（D1）。\n",
      },
      options: {
        ids: [{ name: "設計判断", ref: String.raw`\bD(\d+)\b`, def: String.raw`^D(\d+)\.` }],
      },
    },
  ],
});
