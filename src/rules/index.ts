import type { AnyRule } from "../types.ts";
import columnRef from "./column-ref.ts";
import declaredCount from "./count.ts";
import duplicate from "./duplicate.ts";
import { duplicateEntity, isolatedEntity } from "./entity.ts";
import enumTable from "./enum-table.ts";
import erSyntax from "./er-syntax.ts";
import { jsonBlock, listNumbering } from "./markdown.ts";
import { id as refId, section as refSection } from "./ref.ts";
import relationFk from "./relation-fk.ts";
import stateTable from "./state.ts";

export const builtinRules: AnyRule[] = [
  erSyntax,
  relationFk,
  duplicateEntity,
  isolatedEntity,
  columnRef,
  enumTable,
  stateTable,
  declaredCount,
  refSection,
  refId,
  listNumbering,
  jsonBlock,
  duplicate,
];
