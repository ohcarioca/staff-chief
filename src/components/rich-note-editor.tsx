"use client";

import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { Archive, Bold, Heading2, Italic, List, ListOrdered, Quote, Redo2, Save, Sparkles, Strikethrough, Undo2 } from "lucide-react";
import type { KnowledgeObjectRecord, NoteRecord, ObjectTypeRecord } from "@/lib/contracts";

type MentionItem = {
  id: string;
  label: string;
  typeId: string;
  typeLabel: string;
  color: string;
  isNew: boolean;
};

function mentionSuggestion(types: ObjectTypeRecord[], objects: KnowledgeObjectRecord[]) {
  return {
    char: "@",
    allowSpaces: true,
    items: () => [] as MentionItem[],
    render: () => {
      let selectedType: ObjectTypeRecord | null = null;
      let props: SuggestionProps | null = null;
      let root: HTMLDivElement | null = null;
      let unmount: (() => void) | null = null;
      let selectedIndex = 0;
      let selectable: HTMLButtonElement[] = [];

      const draw = () => {
        if (!root || !props) return;
        root.replaceChildren();
        selectable = [];
        const header = document.createElement("div");
        header.className = "mention-menu-header";
        header.textContent = selectedType ? `${selectedType.icon} ${selectedType.name}` : "Escolha o tipo de objeto";
        root.append(header);

        const addButton = (label: string, meta: string, action: () => void, color?: string) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "mention-menu-item";
          button.onmousedown = (event) => { event.preventDefault(); action(); };
          const dot = document.createElement("span");
          dot.className = "mention-menu-dot";
          dot.style.background = color ?? "var(--ink-muted)";
          const text = document.createElement("span");
          const strong = document.createElement("strong");
          const small = document.createElement("small");
          strong.textContent = label;
          small.textContent = meta;
          text.append(strong, small);
          button.append(dot, text);
          root!.append(button);
          selectable.push(button);
        };

        if (!selectedType) {
          types.forEach((type) => addButton(type.name, "Selecionar tipo", () => {
            selectedType = type;
            selectedIndex = 0;
            draw();
          }, type.color));
        } else {
          const query = props.query.trim().toLocaleLowerCase("pt-BR");
          const matches = objects.filter((object) => object.typeId === selectedType!.id && object.name.toLocaleLowerCase("pt-BR").includes(query)).slice(0, 7);
          matches.forEach((object) => addButton(object.name, "Objeto existente", () => props!.command({
            id: object.id, label: object.name, typeId: object.typeId, typeLabel: object.typeName, color: object.typeColor, isNew: false,
          }), object.typeColor));
          if (props.query.trim()) {
            const exact = matches.some((object) => object.name.toLocaleLowerCase("pt-BR") === query);
            if (!exact) addButton(`Criar “${props.query.trim()}”`, `Novo ${selectedType.name}`, () => props!.command({
              id: `new:${crypto.randomUUID()}`, label: props!.query.trim(), typeId: selectedType!.id,
              typeLabel: selectedType!.name, color: selectedType!.color, isNew: true,
            }), selectedType.color);
          } else if (!matches.length) {
            const empty = document.createElement("p");
            empty.className = "mention-menu-empty";
            empty.textContent = "Digite um nome para criar ou encontrar.";
            root.append(empty);
          }
          const back = document.createElement("button");
          back.type = "button";
          back.className = "mention-menu-back";
          back.textContent = "← Trocar tipo";
          back.onmousedown = (event) => { event.preventDefault(); selectedType = null; draw(); };
          root.append(back);
        }
        if (selectable.length) {
          selectedIndex = Math.min(selectedIndex, selectable.length - 1);
          selectable[selectedIndex].classList.add("is-selected");
        }
      };

      return {
        onStart: (nextProps: SuggestionProps) => {
          props = nextProps;
          root = document.createElement("div");
          root.className = "mention-menu";
          unmount = nextProps.mount(root);
          draw();
        },
        onUpdate: (nextProps: SuggestionProps) => { props = nextProps; draw(); },
        onKeyDown: ({ event }: SuggestionKeyDownProps) => {
          if (event.key === "Escape") return false;
          if (!selectable.length) return false;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            selectedIndex = (selectedIndex + (event.key === "ArrowDown" ? 1 : -1) + selectable.length) % selectable.length;
            draw();
            return true;
          }
          if (event.key === "Enter") {
            selectable[selectedIndex]?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            return true;
          }
          return false;
        },
        onExit: () => {
          unmount?.();
          unmount = null;
          root = null;
          props = null;
          selectedType = null;
        },
      };
    },
  };
}

const StaffMention = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      typeId: { default: null },
      typeLabel: { default: null },
      color: { default: "#45A886" },
      isNew: { default: false },
    };
  },
});

interface RichNoteEditorProps {
  note: NoteRecord | null;
  isNew: boolean;
  objectTypes: ObjectTypeRecord[];
  objects: KnowledgeObjectRecord[];
  onSaved(note: NoteRecord): void;
  onAnalyze(noteId: string): void;
  onArchive(noteId: string): void;
  onSelectObject(objectId: string): void;
  onDirtyChange(dirty: boolean): void;
  compact?: boolean;
}

export function RichNoteEditor({ note, isNew, objectTypes, objects, onSaved, onAnalyze, onArchive, onSelectObject, onDirtyChange, compact = false }: RichNoteEditorProps) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [dirty, setDirty] = useState(isNew && !compact);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const extensions = useMemo(() => [
    StarterKit.configure({ heading: { levels: [2, 3] } }),
    StaffMention.configure({
      HTMLAttributes: { class: "mention-chip" },
      renderText: ({ node }) => `@${node.attrs.label}`,
      renderHTML: ({ node }) => ["span", {
        class: "mention-chip", "data-entity-id": node.attrs.id, "data-type-id": node.attrs.typeId,
        style: `--mention-color:${node.attrs.color}`,
      }, `${node.attrs.typeLabel}: ${node.attrs.label}`],
      suggestion: mentionSuggestion(objectTypes, objects),
    }),
  ], [objectTypes, objects]);
  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: note?.contentJson ?? { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: {
      attributes: { class: "note-editor-content", "aria-label": "Conteúdo da nota" },
      handleClick: (_view, _position, event) => {
        const target = event.target as HTMLElement;
        const mention = target.closest<HTMLElement>("[data-entity-id]");
        if (mention?.dataset.entityId && !mention.dataset.entityId.startsWith("new:")) {
          onSelectObject(mention.dataset.entityId);
          return true;
        }
        return false;
      },
    },
    onUpdate: () => { setDirty(true); onDirtyChange(true); },
  }, [extensions]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  const save = async () => {
    if (!editor || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/notes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: isNew ? undefined : note?.id, title, contentJson: editor.getJSON() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar a nota.");
      setDirty(false);
      onDirtyChange(false);
      editor.commands.setContent(result.contentJson, { emitUpdate: false });
      onSaved(result);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  if (!note && !isNew) {
    return <div className="empty-inspector"><div className="empty-orbit">✦</div><h3>Selecione uma nota</h3><p>O conteúdo e as referências aparecem aqui.</p></div>;
  }

  return <section className={`editor-panel ${compact ? "editor-panel-composer" : ""}`}>
    <header className="inspector-header">
      <div><span className="eyebrow">{isNew ? "Nova nota" : "Nota"}</span><span className={`save-state ${dirty ? "is-dirty" : ""}`}>{dirty ? "Alterações não salvas" : compact ? "Pronta para escrever" : "Salva"}</span></div>
      <div className="header-actions">
        {!isNew && note && <button className="icon-button" title="Arquivar nota" onClick={() => onArchive(note.id)}><Archive size={16} /></button>}
        {!isNew && note && <button className="secondary-button" onClick={() => onAnalyze(note.id)}><Sparkles size={15} /> Analisar</button>}
        <button className="primary-button" onClick={save} disabled={saving || !dirty}><Save size={15} /> {saving ? "Salvando…" : "Salvar"}</button>
      </div>
    </header>
    <input className="note-title-input" value={title} onChange={(event) => { setTitle(event.target.value); setDirty(true); onDirtyChange(true); }} placeholder="Título opcional" maxLength={240} />
    <div className="editor-toolbar" role="toolbar" aria-label="Formatação da nota">
      <button type="button" className={editor?.isActive("bold") ? "is-active" : ""} onClick={() => editor?.chain().focus().toggleBold().run()} title="Negrito" aria-label="Negrito"><Bold size={16} /></button>
      <button type="button" className={editor?.isActive("italic") ? "is-active" : ""} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Itálico" aria-label="Itálico"><Italic size={16} /></button>
      <button type="button" className={editor?.isActive("strike") ? "is-active" : ""} onClick={() => editor?.chain().focus().toggleStrike().run()} title="Tachado" aria-label="Tachado"><Strikethrough size={16} /></button>
      <span className="toolbar-divider" />
      <button type="button" className={editor?.isActive("heading", { level: 2 }) ? "is-active" : ""} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="Título" aria-label="Título"><Heading2 size={16} /></button>
      <button type="button" className={editor?.isActive("bulletList") ? "is-active" : ""} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Lista com marcadores" aria-label="Lista com marcadores"><List size={16} /></button>
      <button type="button" className={editor?.isActive("orderedList") ? "is-active" : ""} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Lista numerada" aria-label="Lista numerada"><ListOrdered size={16} /></button>
      <button type="button" className={editor?.isActive("blockquote") ? "is-active" : ""} onClick={() => editor?.chain().focus().toggleBlockquote().run()} title="Citação" aria-label="Citação"><Quote size={16} /></button>
      <span className="toolbar-divider" />
      <button type="button" onClick={() => editor?.chain().focus().undo().run()} disabled={!editor?.can().undo()} title="Desfazer" aria-label="Desfazer"><Undo2 size={16} /></button>
      <button type="button" onClick={() => editor?.chain().focus().redo().run()} disabled={!editor?.can().redo()} title="Refazer" aria-label="Refazer"><Redo2 size={16} /></button>
      <span className="toolbar-hint">Digite <kbd>@</kbd> para relacionar</span>
    </div>
    <EditorContent editor={editor} className="editor-scroll" />
    {error && <p className="inline-error">{error}</p>}
  </section>;
}
