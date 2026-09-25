// erDiagram を読む。Mermaid の公式パーサーは DOM を要るので、ER 図の文法だけ自前で読む。
// 読めない行は ErSyntaxError に積む（例外にしない。ルール mermaid/er-syntax が報告する）
import type { Attr, Doc, Entity, ErDiagram, ErModel, ErSyntaxError } from "./types.ts";

const NAME = "[A-Za-z_][A-Za-z0-9_-]*";
const ALIAS = String.raw`(?:\[(?:"[^"]*"|[^\]]*)\])?`;
const REL = new RegExp(
  String.raw`^(${NAME})${ALIAS}\s+([|}][|o]|[|}]o|o[|}])(--|\.\.)([|o][|{]|o[|{])\s+(${NAME})${ALIAS}\s*:\s*(?:"([^"]*)"|(\S.*?))\s*$`,
);
const ENT_OPEN = new RegExp(String.raw`^(${NAME})${ALIAS}\s*\{\s*$`);
const ENT_ALONE = new RegExp(String.raw`^(${NAME})${ALIAS}\s*$`);
const ATTR =
  /^([A-Za-z_][\w\-[\]()]*)\s+([A-Za-z_*][\w\-[\]()]*)(?:\s+((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*))?(?:\s+"([^"]*)")?\s*$/;
const DIRECTIVE = /^(%%|direction\s|classDef\s|class\s|style\s|title\s|accTitle|accDescr)/;

export const parseEr = (doc: Doc): { diagrams: ErDiagram[]; errors: ErSyntaxError[] } => {
  const diagrams: ErDiagram[] = [];
  const errors: ErSyntaxError[] = [];
  for (const block of doc.mermaid) {
    if (block.kind !== "erDiagram") continue;
    const d: ErDiagram = { doc, block, entities: [], relations: [] };
    const err = (line: number, message: string): void => {
      errors.push({ doc, line, message: `${block.head || "erDiagram"}: ${message}` });
    };
    let cur: Entity | undefined;
    for (const [i, raw] of block.body.entries()) {
      const line = raw.trim();
      const at = block.line + i;
      if (i === 0 || line === "" || DIRECTIVE.test(line)) continue;
      if (cur !== undefined) {
        if (line === "}") {
          d.entities.push(cur);
          cur = undefined;
          continue;
        }
        const a = ATTR.exec(line);
        if (a?.[1] === undefined || a[2] === undefined) {
          err(at, `属性の行として読めない: ${line}`);
          continue;
        }
        const keys = new Set(
          (a[3] ?? "")
            .split(",")
            .map((k) => k.trim())
            .filter((k) => k !== ""),
        );
        const attr: Attr = { type: a[1], name: a[2], keys, comment: a[4] ?? "", line: at };
        cur.attrs.push(attr);
        continue;
      }
      const r = REL.exec(line);
      if (r?.[1] !== undefined && r[5] !== undefined) {
        const leftMany = (r[2] ?? "").includes("}");
        const rightMany = (r[4] ?? "").includes("{");
        const swap = leftMany && !rightMany;
        d.relations.push({
          parent: swap ? r[5] : r[1],
          child: swap ? r[1] : r[5],
          ambiguous: leftMany === rightMany,
          dashed: r[3] === "..",
          label: r[6] ?? r[7] ?? "",
          diagram: d,
          line: at,
        });
        continue;
      }
      const e = ENT_OPEN.exec(line) ?? ENT_ALONE.exec(line);
      if (e?.[1] !== undefined) {
        const ent: Entity = { name: e[1], attrs: [], diagram: d, line: at };
        if (line.endsWith("{")) cur = ent;
        else d.entities.push(ent);
        continue;
      }
      err(at, `erDiagram の行として読めない: ${line}`);
    }
    if (cur !== undefined) err(cur.line, `${cur.name} の閉じ } が無い`);
    diagrams.push(d);
  }
  return { diagrams, errors };
};

export const buildErModel = (docs: Doc[]): ErModel => {
  const diagrams: ErDiagram[] = [];
  const errors: ErSyntaxError[] = [];
  for (const doc of docs) {
    const r = parseEr(doc);
    diagrams.push(...r.diagrams);
    errors.push(...r.errors);
  }
  // 属性つきの定義を優先する。俯瞰図のように名前だけ出す図があるため
  const entities = new Map<string, Entity>();
  for (const d of diagrams) {
    for (const e of d.entities) {
      const prev = entities.get(e.name);
      if (prev === undefined || (prev.attrs.length === 0 && e.attrs.length > 0))
        entities.set(e.name, e);
    }
  }
  return { diagrams, entities, relations: diagrams.flatMap((d) => d.relations), errors };
};
