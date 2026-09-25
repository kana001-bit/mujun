// 状態遷移表が閉じているか。状態の列挙（列コメント）と遷移表が食い違うと、
// 「どのイベントでその状態に入るのか」が設計書から読めなくなる
import { defineRule } from "../define.ts";
import { cellValues, enumValues, findAttr } from "../er.ts";
import type { Doc } from "../types.ts";

type Options = {
  machines: {
    // 状態を持つ列。値は列コメントの「a / b / c」
    state: string;
    // イベントを持つ列（あれば）。遷移表の 1 列目と突き合わせる
    event?: string;
  }[];
  // 遷移表の見出しの名前。この 2 つを含む表を遷移表とみなす
  from: string[];
  to: string[];
};

type Row = { doc: Doc; line: number; event: string[]; from: string[]; to: string[] };

export default defineRule<Options>({
  id: "state/transition-table",
  description: "状態の列挙と状態遷移表が一致し、どの状態も初期状態から辿り着ける",
  defaultOptions: {
    machines: [],
    from: ["遷移元", "許可する遷移元", "from"],
    to: ["遷移先", "to"],
  },
  check({ project, options, report }) {
    const rows: Row[] = [];
    for (const doc of project.docs) {
      for (const t of doc.tables) {
        const f = t.header.findIndex((h) => options.from.includes(h.replace(/`/g, "")));
        const to = t.header.findIndex((h) => options.to.includes(h.replace(/`/g, "")));
        if (f < 0 || to < 0) continue;
        for (const r of t.rows) {
          rows.push({
            doc,
            line: r.line,
            event: cellValues(r.cells[0] ?? ""),
            from: cellValues(r.cells[f] ?? ""),
            to: cellValues(r.cells[to] ?? ""),
          });
        }
      }
    }
    for (const m of options.machines) {
      const attr = findAttr(project.er, m.state);
      const states = attr === undefined ? [] : enumValues(attr.comment);
      if (states.length === 0) {
        report({ message: `${m.state} の列コメントに「a / b」の形の状態が無い` });
        continue;
      }
      const S = new Set(states);
      const mine = rows.filter((r) => [...r.from, ...r.to].some((v) => S.has(v)));
      const [first] = mine;
      if (first === undefined) {
        report({
          message: `${m.state} の遷移表（見出しに ${options.from.join("／")} と ${options.to.join("／")}）が無い`,
        });
        continue;
      }
      // 表全体に言うことは、表の 1 行目に付ける
      const at = { doc: first.doc, line: first.line };
      const seen = new Set(mine.flatMap((r) => [...r.from, ...r.to]));
      for (const s of states) {
        if (!seen.has(s)) report({ ...at, message: `${m.state} の ${s} が遷移表に無い` });
      }
      for (const r of mine) {
        for (const v of [...r.from, ...r.to]) {
          if (!S.has(v))
            report({
              doc: r.doc,
              line: r.line,
              message: `遷移表の ${v} が ${m.state} の列挙に無い`,
            });
        }
      }
      // 到達: 遷移元が空の行（作成）の行き先と、どこからも入られない状態が初期状態
      const edges = mine.flatMap((r) => r.from.flatMap((f) => r.to.map((t) => [f, t] as const)));
      const entered = new Set(edges.filter(([f, t]) => f !== t).map(([, t]) => t));
      const initial = new Set([
        ...mine.filter((r) => r.from.length === 0).flatMap((r) => r.to),
        ...states.filter((s) => !entered.has(s) && !mine.some((r) => r.from.length === 0)),
      ]);
      const reach = new Set(initial);
      for (let changed = true; changed;) {
        changed = false;
        for (const [f, t] of edges) {
          if (reach.has(f) && !reach.has(t)) {
            reach.add(t);
            changed = true;
          }
        }
      }
      if (initial.size === 0) {
        report({
          ...at,
          message: `${m.state} に初期状態が無い（遷移元が空の行も、どこからも入られない状態も無い）`,
        });
      } else {
        for (const s of states) {
          if (seen.has(s) && !reach.has(s)) {
            report({
              ...at,
              message: `${m.state} の ${s} に初期状態（${[...initial].join(" ")}）から辿り着けない`,
            });
          }
        }
      }
      if (m.event !== undefined) {
        const eattr = findAttr(project.er, m.event);
        const events = eattr === undefined ? [] : enumValues(eattr.comment);
        if (events.length === 0) {
          report({ message: `${m.event} の列コメントに「a / b」の形のイベントが無い` });
          continue;
        }
        const inTable = new Set(mine.flatMap((r) => r.event));
        for (const e of events) {
          if (!inTable.has(e)) report({ ...at, message: `${m.event} の ${e} が遷移表に無い` });
        }
      }
    }
  },
  invalid: [
    {
      name: "列挙にだけ状態を足した",
      files: {
        "a.md": [
          "```mermaid",
          "erDiagram",
          "  ORDER {",
          '    string status "draft / placed / shipped / returned"',
          "  }",
          "```",
          "",
          "| コマンド | 遷移元 | 遷移先 |",
          "| --- | --- | --- |",
          "| （作成） | — | `draft` |",
          "| Place | `draft` | `placed` |",
          "| Ship | `placed` | `shipped` |",
        ].join("\n"),
      },
      options: { machines: [{ state: "ORDER.status" }] },
    },
    {
      name: "遷移表の綴り違い",
      files: {
        "a.md": [
          "```mermaid",
          "erDiagram",
          "  ORDER {",
          '    string status "draft / placed"',
          "  }",
          "```",
          "",
          "| event | from | to |",
          "| --- | --- | --- |",
          "| create | — | draft |",
          "| place | draft | placd |",
        ].join("\n"),
      },
      options: { machines: [{ state: "ORDER.status" }] },
    },
    {
      name: "入口の無い状態",
      files: {
        "a.md": [
          "```mermaid",
          "erDiagram",
          "  ORDER {",
          '    string status "draft / placed / archived"',
          "  }",
          "```",
          "",
          "| コマンド | 遷移元 | 遷移先 |",
          "| --- | --- | --- |",
          "| （作成） | — | `draft` |",
          "| Place | `draft` | `placed` |",
          "| Restore | `archived` | `placed` |",
        ].join("\n"),
      },
      options: { machines: [{ state: "ORDER.status" }] },
    },
    {
      name: "イベントの列挙にだけ足した",
      files: {
        "a.md": [
          "```mermaid",
          "erDiagram",
          "  ORDER {",
          '    string status "draft / placed"',
          "  }",
          "  ORDER_EVENT {",
          '    string event_type "created / placed / cancelled"',
          "  }",
          "```",
          "",
          "| event_type | 許可する遷移元 | 遷移先 |",
          "| --- | --- | --- |",
          "| `created` | — | `draft` |",
          "| `placed` | `draft` | `placed` |",
        ].join("\n"),
      },
      options: { machines: [{ state: "ORDER.status", event: "ORDER_EVENT.event_type" }] },
    },
  ],
  valid: [
    {
      name: "作成の行・同じ状態に留まる行・終端",
      files: {
        "a.md": [
          "```mermaid",
          "erDiagram",
          "  ORDER {",
          '    string status "draft / placed / closed"',
          "  }",
          "```",
          "",
          "| コマンド | 遷移元 | 遷移先 | 副作用 |",
          "| --- | --- | --- | --- |",
          "| （作成） | — | `draft` | |",
          "| Edit | `draft` | 同じ | |",
          "| Place | `draft` | `placed` | |",
          "| Close | `placed` | `closed` | |",
        ].join("\n"),
      },
      options: { machines: [{ state: "ORDER.status" }] },
    },
  ],
});
