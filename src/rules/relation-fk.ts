// 図の線 ↔ FK 列。線があるのに FK が無い、FK があるのに線が無い、の両方を見る。
// FK 列がどのエンティティを指すかは、設計書の「FK 列 | 参照先」表 → 命名規約の順で決める。
// 命名規約は後ろ一致: billing_address_id は ADDRESS、created_by_user_id は USER（長い名前を優先）
import { defineRule } from "../define.ts";
import { ticks } from "../markdown.ts";
import type { Attr, Entity, Project } from "../types.ts";

type Options = {
  // 別名表の見出し行（先頭から一致）。1 列目に `列名`、2 列目に `参照先`（自己参照は SELF）
  aliasTable: string[];
  // 別名表に無い FK 列に、命名規約を当てるか
  convention: boolean;
  // 図の外にあるテーブル（認証基盤の USER など）。ここを指す FK には線を求めない
  external: string[];
  // FK 列があるのに線が無いことも報告するか（false なら線 → FK の片方向だけ）
  requireRelationForFk: boolean;
};

const SELF = "SELF";
const SELF_WORDS = /SELF|自己|同じテーブル|同テーブル/;

const aliases = (project: Project, header: readonly string[]): Map<string, string> => {
  const m = new Map<string, string>();
  for (const doc of project.docs) {
    for (const t of doc.tables) {
      if (!header.every((h, i) => t.header[i] === h)) continue;
      for (const r of t.rows) {
        const col = ticks(r.cells[0] ?? "")[0];
        const cell = r.cells[1] ?? "";
        // 参照先は `ENTITY`。バッククォートが無く SELF や「同じテーブル」とあれば自己参照
        const target =
          ticks(cell).find((t) => t !== SELF) ?? (SELF_WORDS.test(cell) ? SELF : undefined);
        if (col !== undefined && target !== undefined) m.set(col, target);
      }
    }
  }
  return m;
};

export default defineRule<Options>({
  id: "er/relation-fk",
  description: "ER 図の線と FK 列が 1 対 1 に対応している",
  defaultOptions: {
    aliasTable: ["FK 列", "参照先"],
    convention: true,
    external: [],
    requireRelationForFk: true,
  },
  check({ project, options, report }) {
    const { entities, relations } = project.er;
    const alias = aliases(project, options.aliasTable);
    const external = new Set(options.external);
    const known = (n: string): boolean => entities.has(n) || external.has(n);
    const byConvention = (col: string): string | undefined => {
      if (!col.endsWith("_id")) return undefined;
      const words = col.slice(0, -3).split("_");
      for (let i = 0; i < words.length; i++) {
        const n = words.slice(i).join("_").toUpperCase();
        if (known(n)) return n;
      }
      return undefined;
    };
    const targetOf = (e: Entity, a: Attr): string | undefined => {
      const t = alias.get(a.name) ?? (options.convention ? byConvention(a.name) : undefined);
      return t === SELF ? e.name : t;
    };
    const fkTo = (child: Entity, parent: string): boolean =>
      child.attrs.some((a) => a.keys.has("FK") && targetOf(child, a) === parent);

    // 線 → FK
    const edges = new Set<string>();
    for (const r of relations) {
      edges.add(`${r.parent}->${r.child}`);
      if (r.ambiguous) edges.add(`${r.child}->${r.parent}`);
      const child = entities.get(r.child);
      const parent = entities.get(r.parent);
      // 属性を書いていない端は検査できない（俯瞰図だけに出る名前など）
      if (child === undefined || parent === undefined) continue;
      if (child.attrs.length === 0 && parent.attrs.length === 0) continue;
      const ok = fkTo(child, r.parent) || (r.ambiguous && fkTo(parent, r.child));
      if (!ok) {
        report({
          doc: r.diagram.doc,
          line: r.line,
          message: `線 ${r.parent} → ${r.child} に対応する FK 列が ${r.child} に無い`,
        });
      }
    }

    // FK → 線
    for (const e of entities.values()) {
      for (const a of e.attrs) {
        if (!a.keys.has("FK")) continue;
        const t = targetOf(e, a);
        if (t === undefined || !known(t)) {
          report({
            doc: e.diagram.doc,
            line: a.line,
            message: `${e.name}.${a.name} の参照先が分からない（「${options.aliasTable.join(" | ")}」表に書くか、命名を合わせる）`,
          });
          continue;
        }
        if (external.has(t) || !options.requireRelationForFk) continue;
        if (!edges.has(`${t}->${e.name}`)) {
          report({
            doc: e.diagram.doc,
            line: a.line,
            message: `${e.name}.${a.name} → ${t} の線が図に無い`,
          });
        }
      }
    }
  },
  invalid: [
    {
      name: "線があるのに FK が無い",
      files: {
        "er.md":
          "```mermaid\nerDiagram\n  USER {\n    int id PK\n  }\n  ORDER {\n    int id PK\n  }\n  USER ||--o{ ORDER : places\n```\n",
      },
    },
    {
      name: "FK があるのに線が無い",
      files: {
        "er.md":
          "```mermaid\nerDiagram\n  USER {\n    int id PK\n  }\n  ORDER {\n    int user_id FK\n  }\n```\n",
      },
    },
    {
      name: "別名表の参照先と線の先が違う",
      files: {
        "er.md": [
          "| FK 列 | 参照先 |",
          "| --- | --- |",
          "| `buyer_id` | `ACCOUNT` |",
          "",
          "```mermaid",
          "erDiagram",
          "  USER {\n    int id PK\n  }",
          "  ACCOUNT {\n    int id PK\n  }",
          "  ORDER {\n    int buyer_id FK\n  }",
          "  USER ||--o{ ORDER : places",
          "```",
        ].join("\n"),
      },
    },
  ],
  valid: [
    {
      name: "命名規約（後ろ一致）・逆向きの線・別名表・自己参照・図の外",
      options: { external: ["STAFF"] },
      files: {
        "er.md": [
          "| FK 列 | 参照先 |",
          "| --- | --- |",
          "| `buyer_id` | `USER` |",
          "| `parent_id` | SELF |",
          "",
          "```mermaid",
          "erDiagram",
          "  USER {\n    int id PK\n  }",
          "  ORDER {\n    int buyer_id FK\n  }",
          "  ORDER_LINE {\n    int order_id FK\n  }",
          "  CATEGORY {\n    int parent_id FK\n    int created_by_staff_id FK\n  }",
          "  ORDER }o--|| USER : places",
          "  ORDER ||--|{ ORDER_LINE : has",
          "  CATEGORY ||--o{ CATEGORY : parent",
          "```",
        ].join("\n"),
      },
    },
  ],
});
