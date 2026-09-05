import "server-only";
import { createHash } from "node:crypto";
import path from "node:path";
import { documentFormatSchema, LibraryError, MAX_FILE_BYTES, MAX_MARKDOWN_CHARACTERS } from "./contracts";

export function inspectFile(name: string, bytes: Uint8Array) {
  if (!bytes.length) throw new LibraryError("O arquivo está vazio.");
  if (bytes.length > MAX_FILE_BYTES) throw new LibraryError("O arquivo excede o limite de 20 MB.", 413);
  const originalName = name.replaceAll("\\", "/").split("/").pop() || "documento";
  const parsed = documentFormatSchema.safeParse(path.extname(originalName).slice(1).toLowerCase());
  if (!parsed.success) throw new LibraryError("Formato não aceito. Envie TXT, MD, DOCX ou PDF.");
  return { originalName, originalFormat: parsed.data, originalSize: bytes.length, fileHash: createHash("sha256").update(bytes).digest("hex") };
}

function decodeText(bytes: Uint8Array) {
  try {
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error();
    return text.replace(/\r\n?/g, "\n");
  } catch { throw new LibraryError("Codificação inválida. Salve o texto em UTF-8 ou UTF-16 com BOM e tente novamente."); }
}

function checkLength(markdown: string) {
  if (markdown.length > MAX_MARKDOWN_CHARACTERS) throw new LibraryError("O texto convertido excede 2 milhões de caracteres.", 413);
}

export async function convertDocument(name: string, bytes: Uint8Array) {
  const metadata = inspectFile(name, bytes);
  const warnings: string[] = [];
  let markdown = "";
  try {
    if (metadata.originalFormat === "txt" || metadata.originalFormat === "md") {
      markdown = decodeText(bytes);
      // Plain text must not acquire Markdown semantics when imported.
      if (metadata.originalFormat === "txt") markdown = markdown.replace(/([\\`*_{}\[\]<>()#+.!|>~-])/g, "\\$1");
    } else if (metadata.originalFormat === "docx") {
      const [{ default: mammoth }, { default: Turndown }, { gfm }] = await Promise.all([
        import("mammoth"), import("turndown"), import("turndown-plugin-gfm"),
      ]);
      const result = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) }, {
        externalFileAccess: false,
        convertImage: mammoth.images.imgElement(async () => {
          if (!warnings.includes("Imagens do documento não foram importadas.")) warnings.push("Imagens do documento não foram importadas.");
          return { src: "" };
        }),
      });
      const converter = new Turndown({ headingStyle: "atx", codeBlockStyle: "fenced" });
      converter.use(gfm);
      // Word tables commonly have no explicit header row; GFM's default rule
      // leaves those as HTML, which the safe reader deliberately hides.
      converter.addRule("wordTables", {
        filter: "table",
        replacement: (_content, node) => {
          const rows = Array.from(node.querySelectorAll("tr"));
          const values = rows.map((row) => Array.from(row.children).map((cell) =>
            converter.turndown(cell.innerHTML).replace(/\n+/g, " ").replace(/\|/g, "\\|")));
          const width = Math.max(0, ...values.map((row) => row.length));
          if (!width) return "";
          const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
          const header = rows[0]?.querySelector("th") ? values.shift()! : Array<string>(width).fill("");
          return `\n\n${[line(header), line(Array<string>(width).fill("---")), ...values.map(line)].join("\n")}\n\n`;
        },
      });
      converter.remove(["img", "script", "style"]);
      markdown = converter.turndown(result.value);
      if (result.messages.length) warnings.push("Alguns estilos do DOCX não puderam ser preservados. Revise o texto convertido.");
    } else {
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, useWorkerFetch: false });
      try {
        const pdf = await task.promise;
        let textPages = 0;
        const emptyPages: number[] = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          const text = content.items.map((item) => "str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : "").join("").trim();
          if (text) textPages++; else emptyPages.push(pageNumber);
          markdown += `${markdown ? "\n\n" : ""}## Página ${pageNumber}\n\n${text.replace(/([\\`*_{}\[\]<>()#+.!|>~-])/g, "\\$1")}`;
          checkLength(markdown);
          page.cleanup();
        }
        if (!textPages) throw new LibraryError("Este PDF não contém texto extraível. OCR não está disponível nesta versão.");
        if (emptyPages.length) warnings.push(`Páginas sem texto extraível: ${emptyPages.join(", ")}. OCR não está disponível.`);
        warnings.push("A disposição visual do PDF pode mudar na conversão. Revise a ordem do texto e as tabelas.");
      } finally { await task.destroy(); }
    }
  } catch (error) {
    if (error instanceof LibraryError) throw error;
    if (error instanceof Error && error.name === "PasswordException") throw new LibraryError("PDF protegido por senha. Envie uma cópia sem proteção.");
    throw new LibraryError("Não foi possível converter o arquivo. Verifique se ele está íntegro e corresponde ao formato informado.");
  }
  checkLength(markdown);
  if (!markdown.trim()) throw new LibraryError("O arquivo não contém texto para importar.");
  return { ...metadata, markdown, warnings, title: path.basename(metadata.originalName, path.extname(metadata.originalName)).slice(0, 240) || "Documento" };
}
