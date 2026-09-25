// 同じ主張を 2 つの節に書かない。片方だけ直して他方が古いまま残るのが、設計書に矛盾が生まれる経路。
// 文を 5 文字ずつの断片にして、節をまたいで Jaccard 係数で比べる。
// 既定値（しきい値 0.40・最小 18 文字）は、実際の設計書で見つかった重複（0.44〜0.47）を拾い、
// 表の名前が同じなだけの文は通す位置。最小文字数を上げると、対になる短い文が落ちて拾えなくなる
import { matchesGlob } from "node:path";
import { defineRule } from "../define.ts";
import type { Doc } from "../types.ts";

type Options = {
  threshold: number;
  minLength: number;
  ngram: number;
  ignoreFiles: string[];
  // document: 同じ文書の中の節どうしだけ比べる。project: 文書をまたいでも比べる
  scope: "document" | "project";
};

type Sentence = {
  doc: Doc;
  section: string;
  head: string;
  line: number;
  text: string;
  grams: Set<string>;
};

const NOISE = /[`*|—\-\s（）()「」、。・,.]/g;
const OPEN = "「『（(【[";
const CLOSE = "」』）)】]";

// 文に切る。括弧の中の「。」では切らない（「…。」と引用した文を途中で割らないため）
const split = (text: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of text) {
    cur += c;
    if (OPEN.includes(c)) depth++;
    else if (CLOSE.includes(c)) depth = Math.max(depth - 1, 0);
    else if (depth === 0 && "。！？!?".includes(c)) {
      out.push(cur);
      cur = "";
    }
  }
  if (cur.trim() !== "") out.push(cur);
  return out;
};

const sentences = (doc: Doc, options: Options): Sentence[] => {
  const out: Sentence[] = [];
  for (const p of doc.paragraphs) {
    // 引用と、見出しの代わりの太字だけの行は主張ではない
    if (p.quoted || /^\*\*[^*]+\*\*$/.test(p.raw.trim())) continue;
    for (const s of split(p.text)) {
      const n = s.replace(NOISE, "");
      if (n.length < options.minLength) continue;
      const grams = new Set<string>();
      for (let i = 0; i + options.ngram <= n.length; i++) grams.add(n.slice(i, i + options.ngram));
      out.push({
        doc,
        section: `${doc.path}#${p.head}`,
        head: p.head,
        line: p.line,
        text: s.trim(),
        grams,
      });
    }
  }
  return out;
};

const short = (s: string): string => (s.length > 40 ? `${s.slice(0, 40)}…` : s);

export default defineRule<Options>({
  id: "prose/duplicate",
  description: "同じ主張を 2 つの節に書いていない",
  defaultOptions: { threshold: 0.4, minLength: 18, ngram: 5, ignoreFiles: [], scope: "document" },
  check({ project, options, report }) {
    const all = project.docs
      .filter((d) => !options.ignoreFiles.some((g) => matchesGlob(d.path, g)))
      .flatMap((d) => sentences(d, options));
    // 断片 → それを含む文。断片を 1 つも共有しない組は比べない
    const index = new Map<string, number[]>();
    all.forEach((s, i) => {
      for (const g of s.grams) {
        const list = index.get(g);
        if (list === undefined) index.set(g, [i]);
        else list.push(i);
      }
    });
    all.forEach((a, i) => {
      const shared = new Map<number, number>();
      for (const g of a.grams) {
        for (const j of index.get(g) ?? []) if (j > i) shared.set(j, (shared.get(j) ?? 0) + 1);
      }
      for (const [j, n] of shared) {
        const b = all[j];
        if (b === undefined || b.section === a.section) continue;
        if (options.scope === "document" && b.doc !== a.doc) continue;
        const jaccard = n / (a.grams.size + b.grams.size - n);
        if (jaccard < options.threshold) continue;
        report({
          doc: b.doc,
          line: b.line,
          message: `「${short(b.text)}」は ${a.doc.path}:${a.line}（${a.head}）と同じ主張（${jaccard.toFixed(2)}）。片方を参照に変える`,
        });
      }
    });
  },
  invalid: [
    {
      name: "別の節に同じ主張",
      files: {
        "a.md": [
          "## 取消",
          "",
          "注文の取消は出荷前に限って受け付け、出荷後は返品として扱う。",
          "",
          "## 返品",
          "",
          "なお注文の取消は出荷前に限って受け付け、出荷後は返品で扱う。",
        ].join("\n"),
      },
    },
  ],
  valid: [
    {
      name: "同じ節・引用・短い文",
      files: {
        "a.md": [
          "## 取消",
          "",
          "注文の取消は出荷前に限って受け付け、出荷後は返品として扱う。",
          "注文の取消は出荷前に限って受け付け、出荷後は返品として扱う。",
          "",
          "## 返品",
          "",
          "> 注文の取消は出荷前に限って受け付け、出荷後は返品として扱う。",
          "",
          "取消は出荷前だけ。",
        ].join("\n"),
      },
    },
  ],
});
