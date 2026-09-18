export const STORAGE_KEY = "material-center-contracts-v1";
export const clone = (x) => JSON.parse(JSON.stringify(x));
export const uid = () => globalThis.crypto.randomUUID();
const token = /\{\{\s*([^{}\n]{1,60}?)\s*\}\}/gu;
const forbidden = new Set([...Object.getOwnPropertyNames(Object.prototype), "prototype"]);
const str = (x, n, label) => {
  if (typeof x !== "string" || x.length > n) throw Error(`${label}格式不正确或过长`);
  return x;
};
export function fields(t) {
  return [
    ...new Set(
      [t.title, ...t.clauses.flatMap((c) => [c.title, c.body])].flatMap((s) =>
        [...s.matchAll(token)].map((m) => m[1].trim()),
      ),
    ),
  ].filter((k) => !forbidden.has(k));
}
export function cleanTemplate(x, { allowIncomplete = false } = {}) {
  if (
    !x ||
    x.schema !== 1 ||
    !Array.isArray(x.clauses) ||
    !x.clauses.length ||
    x.clauses.length > 150
  )
    throw Error("模板格式不正确，需包含1至150条正文");
  const t = {
    schema: 1,
    id: str(x.id, 100, "模板编号"),
    title: str(x.title, 150, "标题"),
    category: str(x.category || "自定义", 40, "分类"),
    source: str(x.source || "", 2000, "来源"),
    version: x.version ?? 1,
    clauses: x.clauses.map((c) => ({
      id: str(c.id, 100, "条款编号"),
      title: str(c.title, 200, "条款标题"),
      body: str(c.body, 30000, "条款正文"),
    })),
  };
  if (
    !t.title.trim() ||
    !Number.isSafeInteger(t.version) ||
    t.version < 1 ||
    new Set(t.clauses.map((c) => c.id)).size !== t.clauses.length
  )
    throw Error("模板标题、版本或条款编号无效");
  if (JSON.stringify(t).length > 500000) throw Error("单个模板正文超过限制");
  if (fields(t).length > 100) throw Error("模板变量超过100个");
  for (const text of [t.title, ...t.clauses.flatMap((c) => [c.title, c.body])]) {
    for (const m of text.matchAll(token))
      if (forbidden.has(m[1].trim())) throw Error("变量名称无效");
    if (!allowIncomplete && /[{}]/u.test(text.replace(token, "")))
      throw Error("变量请使用成对的 {{字段名称}}，正文不要使用单独花括号");
  }
  return t;
}
export function newDraft(template) {
  const t = cleanTemplate(template);
  return {
    schema: 1,
    id: uid(),
    name: t.title + " · 新案件",
    title: t.title,
    template: clone(t),
    clauses: clone(t.clauses),
    values: {},
    caseText: "",
    synthetic: true,
    updatedAt: new Date().toISOString(),
  };
}
export function cleanDraft(x) {
  if (!x || x.schema !== 1) throw Error("不是支持的案件方案");
  const template = cleanTemplate(x.template);
  const body = cleanTemplate(
    { ...template, title: x.title, clauses: x.clauses },
    { allowIncomplete: true },
  );
  const values = {};
  if (!x.values || typeof x.values !== "object" || Array.isArray(x.values))
    throw Error("案件字段格式不正确");
  for (const [k, v] of Object.entries(x.values)) {
    if (forbidden.has(k) || k.length > 60) throw Error("案件字段名称无效");
    values[k] = str(v, 12000, "案件字段");
  }
  if (Object.keys(values).length > 200) throw Error("案件字段超过限制");
  return {
    schema: 1,
    id: str(x.id, 100, "方案编号"),
    name: str(x.name, 150, "方案名称"),
    title: body.title,
    template,
    clauses: body.clauses,
    values,
    caseText: str(x.caseText || "", 60000, "案件信息"),
    synthetic: x.synthetic !== false,
    updatedAt: str(x.updatedAt || "", 40, "更新时间"),
  };
}
export function renderText(text, values) {
  return text.replace(token, (all, key) =>
    Object.hasOwn(values, key.trim()) && values[key.trim()].trim() ? values[key.trim()] : all,
  );
}
export function renderDraft(d) {
  return {
    title: renderText(d.title, d.values),
    clauses: d.clauses.map((c) => ({
      ...c,
      title: renderText(c.title, d.values),
      body: renderText(c.body, d.values),
    })),
  };
}
export function missingFields(d) {
  return fields({ title: d.title, clauses: d.clauses }).filter((k) => !d.values[k]?.trim());
}
export function changes(d) {
  const b = d.template.clauses;
  return [
    ...d.clauses.map((c) => {
      const old = b.find((x) => x.id === c.id);
      return {
        id: c.id,
        kind: !old ? "新增" : old.title !== c.title || old.body !== c.body ? "调整" : "未改",
        before: old ? renderText(old.title + "\n" + old.body, d.values) : "",
        after: renderText(c.title + "\n" + c.body, d.values),
      };
    }),
    ...b
      .filter((c) => !d.clauses.some((x) => x.id === c.id))
      .map((c) => ({
        id: c.id,
        kind: "删除",
        before: renderText(c.title + "\n" + c.body, d.values),
        after: "",
      })),
  ].filter((c) => c.kind !== "未改");
}
export function parseFacts(text, keys) {
  const allowed = new Set(keys);
  const values = {};
  const unknown = [];
  const conflicts = [];
  const add = (key, value) => {
    const k = key.trim();
    if (forbidden.has(k)) throw Error("字段名称无效");
    if (typeof value !== "string" && typeof value !== "number")
      throw Error("案件JSON只接受文本或数字字段");
    const v = String(value).trim();
    if (v.length > 12000) throw Error("字段内容过长");
    if (!allowed.has(k)) {
      unknown.push(k);
      return;
    }
    if (Object.hasOwn(values, k) && values[k] !== v) conflicts.push(k);
    values[k] = v;
  };
  if (text.trim().startsWith("{")) {
    let x;
    try {
      x = JSON.parse(text);
    } catch {
      throw Error("JSON格式不正确");
    }
    if (!x || Array.isArray(x) || typeof x !== "object") throw Error("请输入字段对象");
    for (const [k, v] of Object.entries(x)) add(k, v);
  } else
    for (const line of text.split(/\r?\n/u)) {
      const m = line.match(/^\s*([^:：]{1,60})\s*[:：]\s*(.*?)\s*$/u);
      if (m) add(m[1], m[2]);
    }
  if (conflicts.length)
    throw Error("同一字段出现不同值，请先核对：" + [...new Set(conflicts)].join("、"));
  return { values, unknown: [...new Set(unknown)] };
}
export function fromText(title, text, source = "用户导入正文；重新排版") {
  const lines = text
    .split(/\r?\n/u)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!lines.length) throw Error("请先填写合同正文");
  const clauses = [];
  let c;
  for (const line of lines) {
    const heading =
      line.length <= 200 &&
      /^(第[一二三四五六七八九十百零\d]+[条章节]|附件[一二三四五六七八九十百零\d]+|签署页$|(?:ARTICLE|Article|SECTION|Section)\s+[\dIVX]+\b|\d+[.、]\s+[^\d])/u.test(
        line,
      );
    if (heading || !c || c.body.length + line.length + 1 > 30000) {
      c = {
        id: uid(),
        title: heading ? line : "",
        body: "",
      };
      clauses.push(c);
      if (c.title) continue;
    }
    c.body += (c.body ? "\n" : "") + line;
  }
  return cleanTemplate({
    schema: 1,
    id: uid(),
    title,
    category: "自定义",
    version: 1,
    source,
    clauses,
  });
}
export function loadState(storage, builtins) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    const d = newDraft(builtins[0]);
    return { schema: 1, templates: [], drafts: [d], active: d.id };
  }
  let x;
  try {
    x = JSON.parse(raw);
  } catch {
    throw Error("本机草稿损坏；请先导出浏览器备份，避免覆盖");
  }
  if (
    x.schema !== 1 ||
    !Array.isArray(x.templates) ||
    !Array.isArray(x.drafts) ||
    !x.drafts.length ||
    x.drafts.length > 100 ||
    x.templates.length > 100
  )
    throw Error("本机数据格式不正确");
  const templates = x.templates.map(cleanTemplate),
    drafts = x.drafts.map(cleanDraft);
  if (
    new Set(drafts.map((d) => d.id)).size !== drafts.length ||
    new Set(templates.map((t) => t.id)).size !== templates.length
  )
    throw Error("本机数据编号重复");
  return {
    schema: 1,
    templates,
    drafts,
    active: drafts.some((d) => d.id === x.active) ? x.active : drafts[0].id,
  };
}
export function writeState(storage, state) {
  const raw = JSON.stringify(state);
  if (raw.length > 4000000) throw Error("本机方案过多，请导出备份后整理");
  storage.setItem(STORAGE_KEY, raw);
}
