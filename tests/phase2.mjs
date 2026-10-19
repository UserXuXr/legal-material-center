import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { DOMParser } from "@xmldom/xmldom";
import { dueDiligenceDemo } from "../online/shared/due-diligence.js";
import { validateBatch, BatchRunner, MemoryStore } from "../online/shared/batch.js";
import { validateDocument, renderMaterial } from "../online/shared/adapters.js";
import {
  definitions,
  cleanBusiness,
  businessFile,
  businessBlocks,
} from "../online/business/model.js";
import { exampleBusiness, exampleLedger } from "../online/business/examples.js";
import {
  serviceTemplates,
  serviceExamples,
} from "../online/contracts/content/software-services.js";
import { newDraft, missingFields, changes, renderDraft } from "../online/contracts/model.js";
import { docxBytes } from "../online/contracts/files.js";
import { newRecord, validateRecord } from "../online/modules/rights/lib/registry.ts";
import { extensionExample } from "../online/modules/rights/lib/extensions.ts";
import { renderDocument } from "../online/modules/rights/lib/documents.ts";
import { pdfFromImages } from "../online/modules/rights/lib/export.ts";
import { renderCertificate } from "../online/certificates/lib/documents.js";
import { pdfFile } from "../online/certificates/lib/export.js";
const root = new URL("../", import.meta.url),
  out = new URL("../work/phase2-qa/", import.meta.url);
await fs.mkdir(out, { recursive: true });
const readJSON = async (p) => JSON.parse(await fs.readFile(new URL(p, root), "utf8"));
const technology = await readJSON("online/certificates/technology-catalog.json"),
  catalog = await readJSON("online/certificates/catalog.json"),
  metrics = await readJSON("online/certificates/font-metrics.json");
const font = await fs.readFile(new URL("online/public/fonts/NotoSansSC-Regular.ttf", root)),
  fontLoader = async () => font.toString("base64"),
  rasterize = async (p) =>
    "data:image/png;base64," +
    (await sharp(Buffer.from(p.svg)).png().toBuffer()).toString("base64");
const checks = [],
  pass = (s) => {
    checks.push(s);
    console.log("PASS", s);
  };
const batch = await dueDiligenceDemo();
assert.equal(batch.documents.length, 38);
assert.equal(
  batch.documents.reduce((n, d) => n + d.formats.length, 0),
  44,
);
assert.equal(validateBatch(batch).length, 0);
for (const doc of batch.documents.filter((d) => d.engine !== "certificates"))
  assert.deepEqual(await validateDocument(doc), [], doc.title);
await fs.writeFile(
  new URL("due-diligence-smoke.batch.json", out),
  JSON.stringify(batch, null, 2) + "\n",
);
pass("38份独立示例、44个约定文件；新旧引擎兼容，逐份输入有效");
for (const t of serviceTemplates) {
  const d = newDraft(t);
  d.values = structuredClone(serviceExamples[t.id]);
  assert.deepEqual(missingFields(d), []);
  assert(d.clauses.length >= 20);
  assert(d.clauses.filter((c) => c.tables?.length).length >= 4);
  const before = JSON.stringify(d.template);
  d.clauses.find((c) => c.tables).tables[0].rows[0][0] = "{{只在表格中出现的字段}}";
  assert(missingFields(d).includes("只在表格中出现的字段"));
  assert(changes(d).some((c) => c.kind === "调整" && c.afterTables));
  assert.equal(JSON.stringify(d.template), before);
  d.values["只在表格中出现的字段"] = "新增范围";
  const bytes = await docxBytes(d),
    zip = await JSZip.loadAsync(bytes),
    xml = await zip.file("word/document.xml").async("string");
  assert(!xml.includes("{{"));
  assert(xml.includes("新增范围"));
  assert(xml.includes("<w:tbl>"));
  assert(xml.includes("<w:tblHeader/>"));
  assert((await zip.file("word/styles.xml").async("string")).includes('w:styleId="TableText"'));
}
pass("9份合同含真实附件表格；变量、缺项、快照隔离和表格修改记录有效");
for (const def of definitions.filter((d) => d.id !== "ledger")) {
  const d = exampleBusiness(def.id);
  d.authoring = { secret: "PRIVATE_EXPECTED_ANSWER_DO_NOT_EXPORT" };
  const blob = await businessFile(d, "docx"),
    zip = await JSZip.loadAsync(await blob.arrayBuffer()),
    xml = await zip.file("word/document.xml").async("string");
  assert(!xml.includes("PRIVATE_EXPECTED"));
  if (["order", "delivery", "acceptance"].includes(d.kind)) assert(xml.includes("<w:tbl>"));
  if (d.kind === "acceptance") {
    assert(xml.includes("有条件通过"));
    assert(xml.includes("尚未盖章"));
  }
  if (d.kind === "email") {
    assert(xml.includes("2026-09-18T16:30:00+08:00"));
    assert(xml.includes("迁移抽样报告.xlsx"));
    assert(!xml.includes("已送达"));
  }
  await fs.writeFile(new URL(def.id + ".docx", out), Buffer.from(await blob.arrayBuffer()));
}
let invalid = exampleBusiness("email");
invalid.messages[0].date = "2026-02-30T10:00:00+08:00";
assert.throws(() => cleanBusiness(invalid), /时区/);
invalid = exampleBusiness("acceptance");
invalid.fields.date = "2026-02-30";
assert.throws(() => cleanBusiness(invalid), /日期/);
pass("11类业务文书真实Word制件；邮件时区和附件、访谈问答、阶段验收及签署状态保留，私有底稿不泄露");
for (const type of ["contracts", "ip", "personnel", "leases", "subsidies", "projects"]) {
  const d = exampleLedger(type),
    blob = await businessFile(d, "xlsx");
  const { default: ExcelJS } = await import("exceljs"),
    book = new ExcelJS.Workbook();
  await book.xlsx.load(await blob.arrayBuffer());
  const sheet = book.getWorksheet("业务明细");
  assert.equal(sheet.rowCount, d.rows.length + 1);
  for (const [i, c] of d.columns.entries()) {
    const value = sheet.getCell(2, i + 1).value;
    if (c.type === "money") assert.equal(value, d.rows[0][c.key] / 100);
    if (c.type === "text") assert.equal(value, d.rows[0][c.key]);
  }
  assert(sheet.views[0].state === "frozen");
  await fs.writeFile(
    new URL("ledger-" + type + ".xlsx", out),
    Buffer.from(await blob.arrayBuffer()),
  );
}
let ledger = exampleLedger("contracts");
ledger.columns = [
  { key: "code", label: "编号", type: "text", width: 20 },
  { key: "money", label: "金额", type: "money", width: 20 },
];
ledger.rows = [
  { code: "0012", money: -12345 },
  { code: '=HYPERLINK("x")', money: 0 },
];
let csv = await (await businessFile(ledger, "csv")).text();
assert(csv.includes('"0012","-123.45"'));
assert(csv.includes("\"'=HYPERLINK"));
ledger.rows[0].money = 0.1;
assert.throws(() => cleanBusiness(ledger), /整数分/);
pass("6类台账保留类型、前导零及整数分金额；CSV阻止文本公式注入并保留负数金额");
const rightsViews = [
  ["patent", "change"],
  ["patent", "grantNotice"],
  ["patent", "pledgeRegistration"],
  ["patent", "pledgeReleaseRequest"],
  ["patent", "pledgeCancellation"],
  ["trademark", "change"],
  ["software", "change"],
];
for (const [kind, view] of rightsViews) {
  const record = newRecord(kind);
  record.fields = { ...record.fields, ...extensionExample(kind, view) };
  record.views = [view];
  const original = JSON.stringify(record);
  assert.deepEqual(validateRecord(record), []);
  const pages = renderDocument(record, view),
    images = [];
  for (const p of pages) images.push(await rasterize(p));
  const pdf = await pdfFromImages(pages, images, {
    searchable: true,
    fontLoader,
    Parser: DOMParser,
  });
  const name = kind + "-" + view;
  await fs.writeFile(new URL(name + ".pdf", out), Buffer.from(await pdf.arrayBuffer()));
  const extracted = execFileSync("pdftotext", [fileURLToPath(new URL(name + ".pdf", out)), "-"], {
    encoding: "utf8",
  });
  assert(extracted.replace(/\s/g, "").includes(record.fields.number.replace(/\s/g, "")));
  if (view === "pledgeReleaseRequest") {
    assert(extracted.includes("申请"));
    assert(!extracted.includes("已注销"));
  }
  if (kind === "software") {
    assert(extracted.includes("一并使用"));
    assert(extracted.includes(record.fields.changeSerial));
  }
  assert.equal(JSON.stringify(record), original);
}
const transfer = newRecord("trademark");
transfer.fields = {
  ...transfer.fields,
  ...extensionExample("trademark", "change"),
  changeNature: "权利转移登记",
};
assert(validateRecord(transfer, ["change"]).some((s) => s.includes("权利转移")));
const long = newRecord("software");
long.fields = {
  ...long.fields,
  ...extensionExample("software", "change"),
  changeAfter: "软件名称及登记事项的补充记载。".repeat(180),
};
assert(renderDocument(long, "change").length > 1);
pass("7类权属扩展PDF实际提取通过；原证不改写，申请与注销结果分开，软著证明说明保留，长文附页完整");
for (const t of technology) {
  const page = renderCertificate(t.example, [...catalog, ...technology], metrics, undefined),
    png = await rasterize(page),
    pdf = await pdfFile(page, png, true, fontLoader, { Parser: DOMParser }),
    name = t.id + ".pdf";
  await fs.writeFile(new URL(name, out), Buffer.from(await pdf.arrayBuffer()));
  const content = execFileSync("pdftotext", [fileURLToPath(new URL(name, out)), "-"], {
    encoding: "utf8",
  });
  assert(content.replace(/\s/g, "").includes(t.example.values["entity.name"].replace(/\s/g, "")));
  assert(content.includes(t.example.values["certificate.number"]));
  const info = execFileSync("pdfinfo", [fileURLToPath(new URL(name, out))], { encoding: "utf8" });
  const expected = t.page_mm[0] > t.page_mm[1] ? "841." : "595.";
  assert(info.includes(expected), info);
  if (t.kind === "spca") {
    assert(content.includes("SJ/T"));
    assert(!content.includes("CMMI"));
  }
  if (t.kind === "mlps_filing") assert(!content.includes("测评通过"));
}
pass("5类科技资质PDF含固定标签与实际字段；A4方向正确，SPCA与CMMI、备案与测评不混淆");
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "native-business-")),
  input = path.join(temp, "input.json"),
  output = path.join(temp, "output");
await fs.writeFile(input, JSON.stringify(exampleBusiness("acceptance")));
const native = JSON.parse(
  execFileSync(
    process.execPath,
    ["tools/render-native-business.mjs", "--input", input, "--output", output],
    { cwd: new URL("../", import.meta.url), encoding: "utf8" },
  ),
);
assert.equal(native.artifacts[0].producer, "native");
assert.equal(native.artifacts[0].origin, null);
assert(native.artifacts[0].path.includes("/candidate/"));
assert.equal(native.inspection, "NOT_PERFORMED");
const replay = JSON.parse(
  execFileSync(
    process.execPath,
    ["tools/render-native-business.mjs", "--input", input, "--output", output],
    { cwd: new URL("../", import.meta.url), encoding: "utf8" },
  ),
);
assert.deepEqual(replay, native);
await fs.rename(path.join(output, "candidate"), path.join(output, "candidate-real"));
await fs.symlink("candidate-real", path.join(output, "candidate"), "dir");
assert.throws(
  () =>
    execFileSync(
      process.execPath,
      ["tools/render-native-business.mjs", "--input", input, "--output", output],
      { cwd: new URL("../", import.meta.url), encoding: "utf8", stdio: "pipe" },
    ),
  /符号链接/,
);

await fs.rm(temp, { recursive: true, force: true });
pass("当前Reference native路线可直接本地制件；记录真实producer与文件，不伪造工作台回执或QC");
await fs.writeFile(
  new URL("report.json", out),
  JSON.stringify({ tested_at: new Date().toISOString(), checks, groups: checks.length }, null, 2) +
    "\n",
);
console.log("完成 " + checks.length + " 组第二批验收检查");
