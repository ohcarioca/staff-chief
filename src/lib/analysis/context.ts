import type { DraftBlock, KnowledgeObjectRecord, NoteRecord, RelationshipRecord } from "@/lib/contracts";

export const contextByteLimits = { improve: 9000, connections: 18000, macro: 30000, deepen: 18000 } as const;
export type AiOperation = keyof typeof contextByteLimits;
export function normalized(value: string) { return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR"); }
const stop = new Set("para como uma umas uns com sem que por dos das nos nas pela pelo mais esta este isso sobre entre ainda muito foi tem ser sao nao projeto pessoa reuniao".split(" "));
export function terms(value: string) { return [...new Set(normalized(value).match(/[\p{L}\p{N}]{3,}/gu) ?? [])].filter((term) => !stop.has(term)); }
export function containsName(text: string, name: string) {
  const haystack = ` ${normalized(text).replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  const needle = normalized(name).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return !!needle && haystack.includes(` ${needle} `);
}
export function nameRange(text: string, name: string) {
  let folded = "";
  const offsets: number[] = [];
  let offset = 0;
  for (const character of text) {
    const part = normalized(character);
    folded += part;
    for (let i = 0; i < part.length; i++) offsets.push(offset);
    offset += character.length;
  }
  offsets.push(text.length);
  const escaped = normalized(name).trim().split(/\s+/).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  if (!escaped) return null;
  const match = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u").exec(folded);
  if (!match) return null;
  return { from: offsets[match.index], to: offsets[match.index + match[0].length] };
}
export function objectCandidates(text: string, objects: KnowledgeObjectRecord[]) {
  return objects.filter((o) => !o.archivedAt && containsName(text, o.name)).slice(0, 20);
}

export function rankNotes(text: string, objectIds: string[], notes: NoteRecord[], relationships: RelationshipRecord[] = [], excludeId?: string) {
  const query = terms(text);
  const linked = new Set(relationships.flatMap((r) => objectIds.includes(r.sourceObjectId) ? [r.targetObjectId] : objectIds.includes(r.targetObjectId) ? [r.sourceObjectId] : []));
  return notes.filter((n) => !n.archivedAt && n.id !== excludeId).map((note) => {
    const words = new Set(terms(`${note.title} ${note.contentText}`));
    const score = query.reduce((sum, term) => sum + (words.has(term) ? 1 : 0), 0)
      + note.mentions.reduce((sum, o) => sum + (objectIds.includes(o.id) ? 4 : linked.has(o.id) ? 2 : 0), 0);
    return { note, score };
  }).filter((n) => n.score > 0).sort((a, b) => b.score - a.score || b.note.updatedAt.localeCompare(a.note.updatedAt) || a.note.id.localeCompare(b.note.id)).map((n) => n.note);
}

export function diverseNotes(ranked: NoteRecord[], seedProjectIds: Set<string>, limit: number) {
  const cross = ranked.filter((n) => n.mentions.some((o) => normalized(o.typeName) === "projeto" && !seedProjectIds.has(o.id))
    && !n.mentions.some((o) => seedProjectIds.has(o.id)));
  const reserved = cross.slice(0, Math.floor(limit * 0.3));
  return [...ranked.filter((n) => !reserved.includes(n)).slice(0, limit - reserved.length), ...reserved];
}

const blockCache = new Map<string, { version: string; blocks: DraftBlock[] }>();
export function noteBlocks(note: NoteRecord) {
  const version = JSON.stringify([note.updatedAt, note.contentText]);
  const cached = blockCache.get(note.id);
  if (cached?.version === version) return cached.blocks;
  const blocks = note.contentText.split(/\n+/).filter((text) => text.trim()).map((text, i) => ({ id: `${note.id}:${i}`, text, protected: false }));
  if (blockCache.size >= 500) blockCache.delete(blockCache.keys().next().value!);
  blockCache.set(note.id, { version, blocks });
  return blocks;
}

export function excerpt(note: NoteRecord, query: string, maxCharacters = 1600) {
  const words = terms(query);
  const blocks = noteBlocks(note);
  if (note.contentText.length <= maxCharacters) return note.contentText;
  const scored = blocks.map((block, index) => ({ block, index, score: words.filter((t) => normalized(block.text).includes(t)).length }));
  const selected = scored.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 3).sort((a, b) => a.index - b.index);
  // Long paragraphs are explicitly shown as excerpts in preview, never hidden from consent.
  return selected.map(({ block }) => block.text.slice(0, maxCharacters)).join("\n[…]\n").slice(0, maxCharacters);
}

export function preservesCriticalValues(before: string, after: string) {
  const values = (text: string) => {
    const numeric = text.match(/\d+(?:[.,:/-]\d+)*(?:\s*%)?/g) ?? [];
    const temporal = normalized(text).match(/\b(?:hoje|amanha|ontem|segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado|domingo|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/g) ?? [];
    return [...numeric, ...temporal].sort();
  };
  return JSON.stringify(values(before)) === JSON.stringify(values(after));
}
