import JSZip from "jszip";
export const xml = (value) =>
  String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c],
    );
export function cleanTable(input) {
  if (
    !input ||
    !Array.isArray(input.headers) ||
    input.headers.length < 1 ||
    input.headers.length > 24 ||
    !Array.isArray(input.rows) ||
    input.rows.length > 5000
  )
    throw Error("表格需含1至24列，最多5000行");
  const text = (v) => {
    if (typeof v !== "string" || v.length > 5000) throw Error("表格单元格需为不超过5000字的文本");
    return v;
  };
  const headers = input.headers.map(text),
    rows = input.rows.map((row) => {
      if (!Array.isArray(row) || row.length !== headers.length)
        throw Error("表格各行列数必须与表头一致");
      return row.map(text);
    });
  const weights = input.widths ?? headers.map(() => 1);
  if (
    !Array.isArray(weights) ||
    weights.length !== headers.length ||
    weights.some((n) => !Number.isFinite(n) || n <= 0 || n > 10000)
  )
    throw Error("表格列宽配置无效");
  return { headers, rows, widths: weights };
}
export function paragraph(text, style = "Normal", extra = "") {
  return (
    '<w:p><w:pPr><w:pStyle w:val="' +
    style +
    '"/>' +
    extra +
    "</w:pPr>" +
    String(text ?? "")
      .split("\n")
      .map(
        (line, i) =>
          (i ? "<w:r><w:br/></w:r>" : "") +
          '<w:r><w:t xml:space="preserve">' +
          xml(line) +
          "</w:t></w:r>",
      )
      .join("") +
    "</w:p>"
  );
}
export function tableXML(input, width = 9026) {
  const t = cleanTable(input),
    sum = t.widths.reduce((n, x) => n + x, 0),
    widths = t.widths.map((x) => Math.floor((x / sum) * width));
  widths[widths.length - 1] += width - widths.reduce((n, x) => n + x, 0);
  const cell = (s, i, head) =>
    '<w:tc><w:tcPr><w:tcW w:w="' +
    widths[i] +
    '" w:type="dxa"/><w:shd w:fill="' +
    (head ? "E9EDE8" : "FFFFFF") +
    '"/><w:vAlign w:val="top"/></w:tcPr>' +
    paragraph(s, "TableText", head ? "<w:keepNext/>" : "") +
    "</w:tc>";
  const row = (values, head) =>
    "<w:tr><w:trPr>" +
    (head ? "<w:tblHeader/>" : "") +
    "</w:trPr>" +
    values.map((s, i) => cell(s, i, head)).join("") +
    "</w:tr>";
  return (
    '<w:tbl><w:tblPr><w:tblW w:w="' +
    width +
    '" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>' +
    ["top", "left", "bottom", "right", "insideH", "insideV"]
      .map((edge) => "<w:" + edge + ' w:val="single" w:sz="4" w:color="A6AEA4"/>')
      .join("") +
    '</w:tblBorders><w:tblCellMar><w:top w:w="90" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' +
    widths.map((w) => '<w:gridCol w:w="' + w + '"/>').join("") +
    "</w:tblGrid>" +
    row(t.headers, true) +
    t.rows.map((r) => row(r, false)).join("") +
    "</w:tbl>" +
    paragraph("")
  );
}
export async function wordBytes({
  title,
  blocks,
  landscape = false,
  synthetic = true,
  compact = false,
}) {
  const zip = new JSZip(),
    ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    width = landscape ? 13958 : 9026;
  const body =
    paragraph(title, "Title") +
    blocks
      .map((b) =>
        b.type === "table"
          ? tableXML(b, width)
          : paragraph(b.text, b.type === "heading" ? "Heading1" : "Normal"),
      )
      .join("");
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      ["document", "styles", "header1", "footer1"]
        .map(
          (p, i) =>
            '<Override PartName="/word/' +
            p +
            '.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.' +
            ["document.main", "styles", "header", "footer"][i] +
            '+xml"/>',
        )
        .join("") +
      "</Types>",
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/_rels/document.xml.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      ["styles", "header1", "footer1"]
        .map(
          (p, i) =>
            '<Relationship Id="r' +
            i +
            '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/' +
            ["styles", "header", "footer"][i] +
            '" Target="' +
            p +
            '.xml"/>',
        )
        .join("") +
      "</Relationships>",
  );
  zip.file(
    "word/document.xml",
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="' +
      ns +
      '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>' +
      body +
      '<w:sectPr><w:headerReference w:type="default" r:id="r1"/><w:footerReference w:type="default" r:id="r2"/><w:pgSz w:w="' +
      (landscape ? 16838 : 11906) +
      '" w:h="' +
      (landscape ? 11906 : 16838) +
      '"' +
      (landscape ? ' w:orient="landscape"' : "") +
      '/><w:pgMar w:top="1260" w:right="1440" w:bottom="1260" w:left="1440" w:header="540" w:footer="540"/></w:sectPr></w:body></w:document>',
  );
  zip.file(
    "word/styles.xml",
    '<?xml version="1.0"?><w:styles xmlns:w="' +
      ns +
      '"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Noto Sans CJK SC"/><w:sz w:val="22"/><w:color w:val="000000"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:line="' +
      (compact ? 300 : 340) +
      '" w:lineRule="auto" w:after="' +
      (compact ? 90 : 130) +
      '"/><w:widowControl/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="' +
      (compact ? 240 : 360) +
      '"/><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="34"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="' +
      (compact ? 140 : 220) +
      '" w:after="' +
      (compact ? 100 : 140) +
      '"/></w:pPr><w:rPr><w:b/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:line="280" w:lineRule="auto" w:after="40"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style></w:styles>',
  );
  zip.file(
    "word/header1.xml",
    '<?xml version="1.0"?><w:hdr xmlns:w="' +
      ns +
      '">' +
      paragraph(synthetic ? "合成案例材料" : "", "Normal", '<w:jc w:val="right"/>') +
      "</w:hdr>",
  );
  zip.file(
    "word/footer1.xml",
    '<?xml version="1.0"?><w:ftr xmlns:w="' +
      ns +
      '"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>',
  );
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
