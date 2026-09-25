import type { AnyRule } from "../types.ts";
import columnRef from "./column-ref.ts";
import duplicate from "./duplicate.ts";
import { duplicateEntity, isolatedEntity } from "./entity.ts";
import erSyntax from "./er-syntax.ts";
import { jsonBlock, listNumbering } from "./markdown.ts";
import { id as refId, section as refSection } from "./ref.ts";
import relationFk from "./relation-fk.ts";

export const builtinRules: AnyRule[] = [
  erSyntax,
  relationFk,
  duplicateEntity,
  isolatedEntity,
  columnRef,
  refSection,
  refId,
  listNumbering,
  jsonBlock,
  duplicate,
];
