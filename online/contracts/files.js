import JSZip from "jszip";
import {tableXML} from '../shared/word.js';
import {
  cleanDraft,
  cleanTemplate,
  changes,
  fromText,
  missingFields,
  renderDraft,
  loadState,
  STORAGE_KEY,
  uid,
} from "./model.js";

const xml = (s) =>
  String(s)
    .replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c],
    )
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const paragraph = (text, style = "Normal", keepNext = false) =>
  `<w:p><w:pPr><w:pStyle w:val="${style}"/>${keepNext ? "<w:keepNext/><w:keepLines/>" : ""}</w:pPr><w:r><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
const pageBreak =
  '<w:p><w:pPr><w:spacing w:after="0" w:line="20" w:lineRule="exact"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>';
const sectionHeading = (title, index, newPage) =>
  `<w:p><w:pPr><w:pStyle w:val="Heading1"/>${newPage ? "<w:pageBreakBefore/>" : ""}</w:pPr><w:bookmarkStart w:id="${index}" w:name="section_${index}"/><w:r><w:t>${xml(title)}</w:t></w:r><w:bookmarkEnd w:id="${index}"/></w:p>`;
export function safeName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 100) || "合同";
}
export function download(data, name, type = "application/json") {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName(name);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function downloadJSON(data, name) {
  download(JSON.stringify(data, null, 2), name);
}
export function draftReport(d) {
  return {
    schema: 1,
    kind: "contract-change-report",
    draftId: d.id,
    name: d.name,
    template: {
      id: d.template.id,
      title: d.template.title,
      version: d.template.version,
      source: d.template.source,
    },
    updatedAt: d.updatedAt,
    title: { before: d.template.title, after: d.title },
    originalOrder: d.template.clauses.map((c) => c.id),
    currentOrder: d.clauses.map((c) => c.id),
    values: d.values,
    changes: changes(d),
  };
}
export async function docxBytes(input) {
  const d = cleanDraft(input);
  cleanTemplate({ ...d.template, title: d.title, clauses: d.clauses });
  const missing = missingFields(d);
  if (missing.length) throw Error("请补全字段：" + missing.join("、"));
  const content = renderDraft(d),
    zip = new JSZip();
  const longDocument = content.clauses.length >= 20;
  const toc = longDocument
    ? content.clauses
        .map(
          (c, i) =>
            `<w:p><w:pPr><w:pStyle w:val="Contents"/></w:pPr><w:hyperlink w:anchor="section_${i}"><w:r><w:t>${xml(c.title || `条款 ${i + 1}`)}</w:t></w:r></w:hyperlink></w:p>`,
        )
        .join("") + pageBreak
    : "";
  const body =
    paragraph(content.title, "Title") +
    (longDocument ? paragraph("正文及附件目录", "Subtitle") + toc : "") +
    content.clauses
      .map(
        (c, index) =>
          sectionHeading(
            c.title || `条款 ${index + 1}`,
            index,
            /^附件[一二三四五六七八九十\d]/.test(c.title) || c.title === "签署页",
          ) +
          c.body
            .split("\n")
            .map((line, i, lines) =>
              paragraph(line, "Normal", c.title.includes("签署页") && i < lines.length - 1),
            )
            .join("") + (c.tables||[]).map(t=>tableXML(t)).join(''),
      )
      .join("");
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/_rels/document.xml.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="567" w:footer="567"/><w:docGrid w:linePitch="312"/></w:sectPr></w:body></w:document>`,
  );
  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Source Han Serif CN"/><w:sz w:val="24"/><w:color w:val="000000"/><w:lang w:val="zh-CN" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="${longDocument ? 120 : 100}" w:line="${longDocument ? 400 : 360}" w:lineRule="exact"/><w:widowControl/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:jc w:val="both"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:before="100" w:after="400" w:line="560" w:lineRule="exact"/><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="220" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Contents"><w:name w:val="Contents"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="left"/><w:spacing w:after="50" w:line="320" w:lineRule="exact"/></w:pPr><w:rPr><w:sz w:val="21"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:snapToGrid w:val="0"/><w:jc w:val="left"/><w:spacing w:after="60" w:line="280" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style></w:styles>`,
  );
  zip.file(
    "word/header1.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:hdr xmlns:w="${W}"><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="888888"/></w:rPr><w:t>${d.synthetic ? "合成案例材料" : ""}</w:t></w:r></w:p></w:hdr>`,
  );
  zip.file(
    "word/footer1.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:ftr xmlns:w="${W}"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`,
  );
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
export async function exportContract(d, pack = false) {
  const bytes = await docxBytes(d);
  if (!pack) {
    download(
      bytes,
      d.name + ".docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    return;
  }
  const zip = new JSZip();
  zip.file(safeName(d.name) + ".docx", bytes);
  zip.file(
    "案件方案.json",
    JSON.stringify({ kind: "contract-draft", draft: cleanDraft(d) }, null, 2),
  );
  zip.file("修改记录.json", JSON.stringify(draftReport(d), null, 2));
  download(await zip.generateAsync({ type: "blob" }), d.name + "-材料包.zip");
}
export async function readImport(file) {
  if (file.size > 5 * 1024 * 1024) throw Error("文件请控制在5MB以内");
  if (/\.json$/i.test(file.name)) {
    const x = JSON.parse(await file.text());
    if (x.kind === "contract-draft") return { draft: cleanDraft(x.draft) };
    if (x.kind === "contract-backup") {
      const raw = JSON.stringify(x.state);
      const state = loadState({ getItem: (key) => (key === STORAGE_KEY ? raw : null) }, []);
      return { state };
    }
    return { template: cleanTemplate(x.template || x) };
  }
  if (!/\.docx$/i.test(file.name)) throw Error("请选择DOCX或工作台导出的JSON文件");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entry = zip.file("word/document.xml");
  if (!entry) throw Error("文件不是有效的DOCX");
  if (entry._data?.uncompressedSize > 2000000) throw Error("合同正文解压后过大");
  const content = await entry.async("string");
  if (content.length > 2000000) throw Error("合同正文过大");
  const doc = new DOMParser().parseFromString(content, "application/xml");
  if (doc.querySelector("parsererror")) throw Error("DOCX正文损坏");
  if (["ins", "del", "moveFrom", "moveTo"].some((tag) => doc.getElementsByTagNameNS(W, tag).length))
    throw Error("此文件含有修订，请先在Word中接受或拒绝修订，再导入");
  const inlineText = (node) => {
    if (node.namespaceURI === W) {
      if (node.localName === "t") return node.textContent;
      if (["br", "cr"].includes(node.localName)) return "\n";
      if (node.localName === "tab") return "\t";
      if (["drawing", "pict"].includes(node.localName)) return "";
    }
    return [...node.childNodes].map(inlineText).join("");
  };
  const paragraphs = [...doc.getElementsByTagNameNS(W, "p")].filter(
    (p) =>
      !p.closest("drawing, pict") &&
      !/^(Contents|Subtitle|TOC\d+)$/i.test(
        p.getElementsByTagNameNS(W, "pStyle")[0]?.getAttributeNS(W, "val") || "",
      ),
  );
  const firstStyle = paragraphs[0]
    ?.getElementsByTagNameNS(W, "pStyle")[0]
    ?.getAttributeNS(W, "val");
  const title =
    firstStyle === "Title" ? inlineText(paragraphs.shift()) : file.name.replace(/\.docx$/i, "");
  const text = paragraphs.map(inlineText).filter(Boolean).join("\n");
  const source =
    "用户导入：" + file.name + "；仅提取正文，表格拆为段落，不保留原版式、图片和页眉页脚";
  const isHeading = (p) =>
    /^heading[1-6]$/i.test(
      p.getElementsByTagNameNS(W, "pStyle")[0]?.getAttributeNS(W, "val") || "",
    ) || !!p.getElementsByTagNameNS(W, "outlineLvl").length;
  if (paragraphs.some(isHeading)) {
    const clauses = [];
    let current;
    for (const p of paragraphs) {
      const line = inlineText(p).trim();
      if (!line) continue;
      const heading = isHeading(p) && line.length <= 200;
      if (heading || !current || current.body.length + line.length + 1 > 30000) {
        current = { id: uid(), title: heading ? line : "", body: "" };
        clauses.push(current);
      }
      if (!heading) current.body += (current.body ? "\n" : "") + line;
    }
    return {
      template: cleanTemplate({
        schema: 1,
        id: uid(),
        version: 1,
        title,
        category: "自定义",
        source,
        clauses,
      }),
    };
  }
  return {
    template: fromText(title, text, source),
  };
}
