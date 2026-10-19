import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import JSZip from "jszip";
import { templates, examples } from "../online/contracts/templates.js";
import {
  clone,
  cleanTemplate,
  cleanDraft,
  newDraft,
  fields,
  renderText,
  parseFacts,
  changes,
  loadState,
  writeState,
  STORAGE_KEY,
  missingFields,
  fromText,
} from "../online/contracts/model.js";
import { docxBytes, draftReport, readImport } from "../online/contracts/files.js";

const output = new URL("../work/contracts-v2-qa/", import.meta.url);
await mkdir(output, { recursive: true });
const fixture = [];
for (const template of templates) {
  cleanTemplate(template);
  const d = newDraft(template);
  await assert.rejects(docxBytes(d), /请补全字段/);
  d.values = clone(examples[template.id]);
  assert.deepEqual(missingFields(d), [], template.id + "示例字段应完整");
  const bytes = await docxBytes(d),
    zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml").async("string");
  assert.ok(!xml.includes("{{"));
  assert.ok(xml.includes(d.values[fields(template)[0]]));
  assert.ok(zip.file("word/styles.xml"));
  assert.ok(zip.file("word/_rels/document.xml.rels"));
  const bookmarks = [...xml.matchAll(/w:bookmarkStart w:id="(\d+)" w:name="([^"]+)"/g)].map(
    (m) => m[2],
  );
  assert.equal(new Set(bookmarks).size, d.clauses.length);
  const links = [...xml.matchAll(/w:hyperlink w:anchor="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(
    links.every((target) => bookmarks.includes(target)),
    "目录链接须指向存在的标题",
  );
  if (d.clauses.length >= 20) assert.equal(links.length, d.clauses.length);
  const appendices = d.clauses.filter((c) => /^附件[一二三四五六七八九十\d]/.test(c.title));
  assert.ok((xml.match(/w:pageBreakBefore/g) || []).length >= appendices.length);
  await writeFile(new URL(template.id + ".docx", output), bytes);
  fixture.push(d);
}
const apa = templates[0];
assert.ok(apa.clauses.some((c) => c.title.includes("索赔") && c.body.includes("第三方")));
assert.ok(apa.clauses.some((c) => c.title.includes("披露") && c.body.includes("交割")));
assert.equal(apa.clauses.filter((c) => c.title.startsWith("附件")).length, 14);
assert.ok(
  apa.clauses.reduce((n, c) => n + c.body.length, 0) > 20000,
  "完整正文与附件不应回退为条款骨架",
);
const legacyTemplate = {
  ...clone(templates[0]),
  version: 1,
  clauses: [{ id: "c1", title: "原稿", body: "保留用户原稿" }],
};
const legacy = newDraft(legacyTemplate);
const legacyState = { schema: 1, templates: [], drafts: [legacy], active: legacy.id };
const legacyLoaded = loadState({ getItem: () => JSON.stringify(legacyState) }, templates);
assert.equal(legacyLoaded.drafts[0].template.version, 1);
assert.equal(legacyLoaded.drafts[0].clauses[0].body, "保留用户原稿");
const d = fixture[0],
  snapshot = JSON.stringify(templates[0]);
d.clauses[0].body += "\n新增测试约定。";
assert.equal(JSON.stringify(templates[0]), snapshot);
assert.equal(d.template.clauses[0].body, templates[0].clauses[0].body);
assert.equal(changes(d)[0].kind, "调整");
d.clauses.pop();
assert.ok(changes(d).some((c) => c.kind === "删除"));
d.clauses.push({ id: "new", title: "新增", body: "约定" });
assert.ok(changes(d).some((c) => c.kind === "新增"));
d.clauses.reverse();
assert.notDeepEqual(draftReport(d).currentOrder, draftReport(d).originalOrder);
assert.equal(
  renderText("甲：{{ 名称 }}；乙：{{缺失}}", { 名称: "A & B <有限公司>" }),
  "甲：A & B <有限公司>；乙：{{缺失}}",
);
assert.deepEqual(parseFacts("买方名称：甲公司\n金额：1", ["买方名称"]), {
  values: { 买方名称: "甲公司" },
  unknown: ["金额"],
});
assert.deepEqual(parseFacts('{"金额":0}', ["金额"]).values, { 金额: "0" });
assert.throws(() => parseFacts("金额：1\n金额：2", ["金额"]), /不同值/);
assert.throws(() => parseFacts('{"__proto__":"x"}', []), /名称无效/);
assert.throws(() => parseFacts('{"金额":{}}', ["金额"]), /文本或数字/);
assert.throws(
  () => cleanTemplate({ ...templates[0], clauses: [{ id: "1", title: "", body: "{{未闭合" }] }),
  /成对/,
);
assert.throws(() => cleanDraft({ ...d, values: JSON.parse('{"__proto__":"x"}') }), /名称无效/);
assert.throws(
  () =>
    cleanTemplate({ ...templates[0], clauses: [templates[0].clauses[0], templates[0].clauses[0]] }),
  /编号无效/,
);
assert.equal(
  fromText("测试合同", "第一条 当事人\n甲方：{{甲方}}\n第二条 保密\n内容。").clauses.length,
  2,
);
const store = new Map(),
  storage = { getItem: (k) => store.get(k), setItem: (k, v) => store.set(k, v) };
const state = loadState(storage, templates);
state.drafts = [...fixture];
state.active = fixture[1].id;
writeState(storage, state);
assert.deepEqual(loadState(storage, templates), state);
store.set(STORAGE_KEY, "not-json");
assert.throws(() => loadState(storage, templates), /损坏/);
assert.equal(store.get(STORAGE_KEY), "not-json");
assert.throws(
  () =>
    writeState(
      {
        setItem: () => {
          throw Error("QuotaExceededError");
        },
      },
      state,
    ),
  /QuotaExceeded/,
);
const draftImport = await readImport(
  new File([JSON.stringify({ kind: "contract-draft", draft: d })], "case.json"),
);
const numbered = fromText(
  "长合同",
  "第一条 总则\n1.1 当事人为{{甲方}}。\n1.2 范围。\n第二条 价款\n2.1 合计十万元。\n签署页\n签字。\n附件一 清单\n设备。",
);
assert.equal(numbered.clauses.length, 4, "条款子编号不应被拆成数百个顶层条款");
assert.deepEqual(fields(numbered), ["甲方"]);
const plainLong = fromText("长正文", ("无标题的合同段落。".repeat(1000) + "\n").repeat(5));
assert.equal(
  plainLong.clauses.map((c) => c.body).join("\n"),
  ("无标题的合同段落。".repeat(1000) + "\n").repeat(5).trim(),
);
const templateImport = await readImport(
  new File(
    [JSON.stringify({ kind: "contract-template", template: templates[0] })],
    "template.json",
  ),
);
assert.deepEqual(templateImport.template, templates[0]);
await assert.rejects(
  readImport(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.docx")),
  /5MB/,
);
assert.deepEqual(draftImport.draft, d);
const backupImport = await readImport(
  new File([JSON.stringify({ kind: "contract-backup", state })], "backup.json"),
);
assert.equal(backupImport.state.drafts.length, templates.length);
const partial = clone(fixture[2]);
partial.clauses[0].body += "\n{{正在输入";
assert.equal(cleanDraft(partial).clauses[0].body, partial.clauses[0].body);
await assert.rejects(docxBytes(partial), /成对/);
assert.throws(() => cleanTemplate({ ...templates[0], version: 0 }), /版本/);
assert.throws(() => parseFacts('{"toString":"x"}', ["toString"]), /名称无效/);
await assert.rejects(readImport(new File(["wrong"], "case.pdf")), /DOCX/);
const escaped = clone(fixture[2]);
escaped.values.甲方名称 = "A & B <有限公司>";
const ez = await JSZip.loadAsync(await docxBytes(escaped));
assert.ok(
  (await ez.file("word/document.xml").async("string")).includes("A &amp; B &lt;有限公司&gt;"),
);
await writeFile(
  new URL("cases.json", output),
  JSON.stringify({ kind: "contract-backup", state }, null, 2),
);
console.log(
  "合同验证通过：12份Word、版本隔离、修改记录、字段解析、缺项拦截、存储恢复、导入校验及XML转义。",
);
