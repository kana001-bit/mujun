// Markdown を Doc に読む。構造は mdast に任せ、表のセルは元の文字列（`x` や **x** を残したまま）で持つ。
import type { Nodes, Root } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { gfmTable } from "micromark-extension-gfm-table";
import type {
  CodeBlock,
  CodeSpan,
  Doc,
  Heading,
  MermaidBlock,
  OrderedList,
  Paragraph,
  Table,
} from "./types.ts";

const plain = (n: Nodes): string => {
  if ("value" in n) return n.value;
  if ("children" in n) return n.children.map(plain).join("");
  return "";
};

export const parseDoc = (path: string, text: string): Doc => {
  const tree: Root = fromMarkdown(text, {
    extensions: [gfmTable()],
    mdastExtensions: [gfmTableFromMarkdown()],
  });
  const raw = (n: Nodes): string =>
    text.slice(n.position?.start.offset ?? 0, n.position?.end.offset ?? 0);
  const lineOf = (n: Nodes): number => n.position?.start.line ?? 0;

  const headings: Heading[] = [];
  const mermaid: MermaidBlock[] = [];
  const tables: Table[] = [];
  const codeSpans: CodeSpan[] = [];
  const codeBlocks: CodeBlock[] = [];
  const orderedLists: OrderedList[] = [];
  const paragraphs: Paragraph[] = [];
  let head = "";
  let quoted = 0;

  // 文書順に歩く。見出しは入れ子にならないので、出会った順に head を更新すればよい
  const walk = (n: Nodes): void => {
    switch (n.type) {
      case "heading":
        head = plain(n).trim();
        headings.push({ depth: n.depth, text: head, line: lineOf(n) });
        return;
      case "code":
        codeBlocks.push({
          lang: n.lang ?? "",
          value: n.value,
          line: lineOf(n) + 1,
          endLine: n.position?.end.line ?? 0,
          head,
        });
        if (n.lang === "mermaid") {
          const body = n.value.split("\n");
          mermaid.push({
            head,
            kind: body[0]?.trim().split(/\s+/)[0] ?? "",
            body,
            line: lineOf(n) + 1,
          });
        }
        return;
      case "paragraph":
        paragraphs.push({
          text: plain(n),
          raw: raw(n),
          line: lineOf(n),
          head,
          quoted: quoted > 0,
        });
        break;
      case "blockquote":
        quoted++;
        for (const c of n.children) walk(c);
        quoted--;
        return;
      case "list":
        if (n.ordered === true) {
          orderedLists.push({
            line: lineOf(n),
            items: n.children.map((item) => ({
              number: Number(/^\s*(\d+)/.exec(raw(item))?.[1] ?? Number.NaN),
              line: lineOf(item),
            })),
          });
        }
        break;
      case "inlineCode":
        codeSpans.push({ value: n.value, line: lineOf(n) });
        return;
      case "table": {
        const [first, ...rest] = n.children;
        const cells = (r: typeof first): string[] =>
          (r?.children ?? []).map((c) => raw(c).replace(/^\|/, "").replace(/\|$/, "").trim());
        tables.push({
          header: cells(first),
          rows: rest.map((r) => ({ cells: cells(r), line: lineOf(r) })),
          line: lineOf(n),
          head,
        });
        // セルの中のインラインコードも本文として拾う
        break;
      }
      default:
        break;
    }
    if ("children" in n) for (const c of n.children) walk(c);
  };
  walk(tree);

  return {
    path,
    text,
    headings,
    mermaid,
    tables,
    codeSpans,
    codeBlocks,
    orderedLists,
    paragraphs,
  };
};

// コードブロックの外の行。コードブロックの行は空文字にして、行番号を保つ
export const proseLines = (doc: Doc): { text: string; line: number }[] => {
  const lines = doc.text.split("\n");
  for (const b of doc.codeBlocks) lines.fill("", Math.max(b.line - 2, 0), b.endLine);
  return lines.map((text, i) => ({ text, line: i + 1 }));
};

// 見出し行が header（先頭から順に一致）で始まる表を探す
export const findTables = (doc: Doc, header: readonly string[]): Table[] =>
  doc.tables.filter((t) => header.every((h, i) => t.header[i] === h));

export const ticks = (s: string): string[] => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? "");
