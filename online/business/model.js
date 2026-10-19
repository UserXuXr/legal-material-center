import { cleanTable, wordBytes } from "../shared/word.js";
export const BUSINESS_SCHEMA = "business-document/1";
export const definitions = [
  {
    id: "order",
    title: "项目订单",
    group: "合同履行",
    fields: [
      ["number", "订单编号"],
      ["contract", "合同编号"],
      ["buyer", "采购方"],
      ["supplier", "供应方"],
      ["date", "下单日期", "date"],
      ["status", "订单状态"],
    ],
  },
  {
    id: "statement-of-work",
    title: "项目任务书",
    group: "合同履行",
    fields: [
      ["number", "任务书编号"],
      ["contract", "合同编号"],
      ["project", "项目名称"],
      ["customer", "委托方"],
      ["supplier", "承接方"],
      ["date", "确认日期", "date"],
    ],
  },
  {
    id: "delivery",
    title: "交付清单",
    group: "合同履行",
    fields: [
      ["number", "交付编号"],
      ["contract", "合同编号"],
      ["order", "订单编号"],
      ["project", "项目名称"],
      ["sender", "交付方"],
      ["recipient", "接收方"],
      ["date", "交付日期", "date"],
      ["status", "交付状态"],
    ],
  },
  {
    id: "acceptance",
    title: "项目验收记录",
    group: "合同履行",
    fields: [
      ["number", "验收单编号"],
      ["contract", "合同编号"],
      ["order", "订单编号"],
      ["project", "项目名称"],
      ["customer", "验收方"],
      ["supplier", "交付方"],
      ["date", "记录日期", "date"],
      ["status", "验收结论"],
    ],
  },
  {
    id: "supplement",
    title: "项目补充协议",
    group: "合同履行",
    fields: [
      ["number", "补充协议编号"],
      ["contract", "原合同编号"],
      ["customer", "甲方"],
      ["supplier", "乙方"],
      ["date", "签署日期", "date"],
      ["status", "签署状态"],
    ],
  },
  {
    id: "reconciliation",
    title: "项目结算对账单",
    group: "合同履行",
    fields: [
      ["number", "对账单编号"],
      ["contract", "合同编号"],
      ["customer", "客户"],
      ["supplier", "供应商"],
      ["period", "对账期间"],
      ["date", "制表日期", "date"],
      ["status", "对账状态"],
    ],
  },
  {
    id: "interview",
    title: "尽调访谈记录",
    group: "沟通与说明",
    fields: [
      ["interviewee", "受访人"],
      ["role", "职务"],
      ["interviewer", "访谈人"],
      ["date", "访谈日期", "date"],
      ["place", "访谈方式或地点"],
      ["confirmation", "记录确认情况"],
    ],
  },
  { id: "email", title: "项目往来邮件", group: "沟通与说明", fields: [] },
  {
    id: "minutes",
    title: "项目会议纪要",
    group: "沟通与说明",
    fields: [
      ["date", "会议日期", "date"],
      ["place", "地点或会议方式"],
      ["attendees", "参会人"],
      ["recorder", "记录人"],
      ["confirmation", "纪要确认情况"],
    ],
  },
  {
    id: "ip-statement",
    title: "知识产权情况说明",
    group: "沟通与说明",
    fields: [
      ["issuer", "出具方"],
      ["date", "出具日期", "date"],
      ["scope", "说明范围"],
      ["reviewDate", "资料核对截止日", "date"],
    ],
  },
  {
    id: "policy",
    title: "内部管理制度",
    group: "沟通与说明",
    fields: [
      ["number", "制度编号"],
      ["version", "版本"],
      ["issuer", "发布部门"],
      ["date", "发布日期", "date"],
      ["effectiveDate", "生效日期", "date"],
      ["status", "批准或执行状态"],
    ],
  },
  {
    id: "ledger",
    title: "业务台账",
    group: "业务台账",
    fields: [
      ["issuer", "编制单位"],
      ["period", "统计期间"],
      ["date", "制表日期", "date"],
      ["basis", "统计口径"],
    ],
  },
];
const def = (id) => definitions.find((d) => d.id === id);
const text = (v, label, max = 12000) => {
  if (typeof v !== "string" || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))
    throw Error(label + "需为有效文本，最多" + max + "字");
  return v;
};
export function validDate(s) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s + "T00:00:00Z")) &&
    new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s
  );
}
export function cleanBusiness(input) {
  if (!input || input.schema_version !== BUSINESS_SCHEMA || !def(input.kind))
    throw Error("请选择有效的业务文书类型");
  if (
    Object.keys(input).some(
      (k) =>
        ![
          "schema_version",
          "id",
          "kind",
          "title",
          "fields",
          "blocks",
          "dialogue",
          "messages",
          "columns",
          "rows",
          "authoring",
        ].includes(k),
    )
  )
    throw Error("业务文书含不支持字段");
  const d = {
    schema_version: BUSINESS_SCHEMA,
    id: text(input.id, "文档编号", 100),
    kind: input.kind,
    title: text(input.title, "标题", 150),
    fields: {},
    blocks: [],
  };
  if (!d.id || !d.title.trim()) throw Error("请填写文档编号和标题");
  if (!input.fields || typeof input.fields !== "object" || Array.isArray(input.fields))
    throw Error("文书字段需为对象");
  const definition = def(d.kind),
    allowed = new Set(definition.fields.map((f) => f[0]));
  if (Object.keys(input.fields).some((k) => !allowed.has(k)))
    throw Error("文书字段不属于本类型；其他信息请放入正文段落");
  for (const [key, label, type] of definition.fields) {
    const value = text(input.fields[key] ?? "", label, 5000);
    if (!value.trim()) throw Error("请填写" + label + "；原材料未载时可填写“未载明”");
    if (type === "date" && value !== "未载明" && !validDate(value)) throw Error(label + "日期无效");
    d.fields[key] = value;
  }
  if (!Array.isArray(input.blocks) || input.blocks.length > 200)
    throw Error("正文需为不超过200个段落或表格的数组");
  d.blocks = input.blocks.map((b) => {
    if (b?.type === "table") return { type: "table", ...cleanTable(b) };
    if (
      !b ||
      !["heading", "paragraph"].includes(b.type) ||
      Object.keys(b).some((k) => !["type", "text"].includes(k))
    )
      throw Error("正文块需为heading、paragraph或table");
    return { type: b.type, text: text(b.text, "正文", 30000) };
  });
  if (d.kind === "interview") {
    if (!Array.isArray(input.dialogue) || !input.dialogue.length || input.dialogue.length > 200)
      throw Error("访谈需包含1至200组问答");
    d.dialogue = input.dialogue.map((q) => ({
      question: text(q.question, "问题", 8000),
      answer: text(q.answer, "回答", 12000),
    }));
    if (d.dialogue.some((q) => !q.question.trim() || !q.answer.trim()))
      throw Error("访谈问题或回答不可为空");
  }
  if (d.kind === "email") {
    if (!Array.isArray(input.messages) || !input.messages.length || input.messages.length > 100)
      throw Error("邮件需包含1至100条往来");
    d.messages = input.messages.map((m) => {
      if (
        !m ||
        Object.keys(m).some(
          (k) =>
            ![
              "from",
              "to",
              "cc",
              "date",
              "subject",
              "body",
              "attachments",
              "deliveryRecord",
            ].includes(k),
        )
      )
        throw Error("邮件含不支持字段");
      const out = {};
      for (const k of ["from", "to", "date", "subject", "body"]) {
        out[k] = text(m[k], k);
        if (!out[k].trim()) throw Error("邮件" + k + "不可为空");
      }
      if (
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:Z|[+-]\d\d:\d\d)$/.test(out.date) ||
        Number.isNaN(Date.parse(out.date)) ||
        !validDate(out.date.slice(0, 10))
      )
        throw Error("邮件时间须包含时区，例如2026-09-18T10:30:00+08:00");
      out.cc = text(m.cc ?? "", "抄送");
      out.deliveryRecord = text(m.deliveryRecord ?? "", "邮件回执记载");
      if (
        !Array.isArray(m.attachments) ||
        m.attachments.some((a) => typeof a !== "string" || a.length > 200)
      )
        throw Error("附件需为文件名数组");
      out.attachments = [...m.attachments];
      return out;
    });
  }
  if (d.kind === "ledger") {
    if (
      !Array.isArray(input.columns) ||
      input.columns.length < 1 ||
      input.columns.length > 24 ||
      !Array.isArray(input.rows) ||
      input.rows.length > 5000
    )
      throw Error("台账需有1至24列，最多5000行");
    const keys = new Set();
    d.columns = input.columns.map((c) => {
      if (
        !c ||
        typeof c.key !== "string" ||
        !c.key ||
        ["__proto__", "constructor", "prototype"].includes(c.key) ||
        keys.has(c.key) ||
        !["text", "number", "money", "date", "boolean"].includes(c.type)
      )
        throw Error("台账列编号或类型无效、重复");
      keys.add(c.key);
      return {
        key: text(c.key, "列编号", 60),
        label: text(c.label, "列标题", 100),
        type: c.type,
        width: Number.isFinite(c.width) && c.width >= 8 && c.width <= 80 ? c.width : 20,
      };
    });
    d.rows = input.rows.map((row) => {
      if (
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        Object.keys(row).some((k) => !keys.has(k))
      )
        throw Error("台账行含未声明的字段");
      const out = {};
      for (const c of d.columns) {
        const v = row[c.key];
        if (v === null || v === undefined || v === "") {
          out[c.key] = null;
          continue;
        }
        if (c.type === "text") out[c.key] = text(v, c.label, 5000);
        else if (c.type === "date") {
          if (typeof v !== "string" || !validDate(v)) throw Error(c.label + "日期无效");
          out[c.key] = v;
        } else if (c.type === "boolean") {
          if (typeof v !== "boolean") throw Error(c.label + "需为布尔值");
          out[c.key] = v;
        } else {
          if (!Number.isFinite(v) || (c.type === "money" && !Number.isSafeInteger(v)))
            throw Error(c.label + (c.type === "money" ? "须用整数分" : "须为数字"));
          out[c.key] = v;
        }
      }
      return out;
    });
  }
  if (d.kind !== "ledger" && d.kind !== "email" && d.kind !== "interview" && !d.blocks.length)
    throw Error("请填写业务正文");
  if (
    ["order", "delivery", "acceptance", "reconciliation", "statement-of-work"].includes(d.kind) &&
    !d.blocks.some((b) => b.type === "table" && b.rows.length)
  )
    throw Error("本类履行文书需要至少一份明细表");
  if (JSON.stringify(d).length > 3_000_000) throw Error("业务文书超过3MB，请分批制作");
  return d;
}
export const formatsFor = (d) => (d.kind === "ledger" ? ["docx", "xlsx", "csv"] : ["docx"]);
export const displayCell = (value, column) =>
  value === null || value === undefined
    ? ""
    : column.type === "money"
      ? (value / 100).toFixed(2)
      : column.type === "boolean"
        ? value
          ? "是"
          : "否"
        : String(value);
export function businessBlocks(input) {
  const d = cleanBusiness(input),
    out = def(d.kind).fields.map(([k, label]) => ({
      type: "paragraph",
      text: label + "：" + d.fields[k],
    }));
  if (d.kind === "interview")
    out.splice(
      0,
      6,
      { type: "paragraph", text: "受访人：" + d.fields.interviewee + "    职务：" + d.fields.role },
      {
        type: "paragraph",
        text: "访谈人：" + d.fields.interviewer + "    访谈日期：" + d.fields.date,
      },
      { type: "paragraph", text: "访谈方式或地点：" + d.fields.place },
      { type: "paragraph", text: "记录确认情况：" + d.fields.confirmation },
    );
  if (d.kind === "email")
    for (const m of d.messages)
      out.push(
        { type: "heading", text: m.subject },
        ...["from", "to", "cc", "date"]
          .filter((k) => m[k])
          .map((k) => ({
            type: "paragraph",
            text: { from: "发件人", to: "收件人", cc: "抄送", date: "时间" }[k] + "：" + m[k],
          })),
        { type: "paragraph", text: "附件：" + (m.attachments.join("；") || "无") },
        { type: "paragraph", text: m.body },
        ...(m.deliveryRecord ? [{ type: "paragraph", text: "回执记载：" + m.deliveryRecord }] : []),
      );
  if (d.kind === "interview")
    d.dialogue.forEach((q, i) =>
      out.push(
        { type: "heading", text: i + 1 + " " + q.question },
        { type: "paragraph", text: q.answer },
      ),
    );
  out.push(...d.blocks);
  if (d.kind === "ledger")
    out.push({
      type: "table",
      headers: d.columns.map((c) => c.label),
      widths: d.columns.map((c) => c.width),
      rows: d.rows.map((r) => d.columns.map((c) => displayCell(r[c.key], c))),
    });
  return out;
}
export async function businessFile(input, format) {
  const d = cleanBusiness(input);
  if (!formatsFor(d).includes(format)) throw Error("本类业务文书不支持" + format);
  if (format === "docx")
    return new Blob(
      [
        await wordBytes({
          title: d.title,
          blocks: businessBlocks(d),
          compact: d.kind === "interview",
          landscape: d.kind === "ledger" && d.columns.length > 6,
        }),
      ],
      { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    );
  if (format === "csv") {
    const escape = (s, guard = true) =>
      '"' +
      (guard && /^[=+@\-\t\r]/.test(String(s)) ? "'" : "") +
      String(s).replace(/"/g, '""') +
      '"';
    const rows = [
      d.columns.map((c) => escape(c.label)),
      ...d.rows.map((r) =>
        d.columns.map((c) => escape(displayCell(r[c.key], c), c.type === "text")),
      ),
    ];
    return new Blob(["\ufeff" + rows.map((row) => row.join(",")).join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
  }
  const { default: ExcelJS } = await import("exceljs"),
    book = new ExcelJS.Workbook();
  book.creator = "业务文书工作台";
  book.created = new Date("2026-01-01T00:00:00Z");
  const sheet = book.addWorksheet("业务明细", {
    views: [{ state: "frozen", ySplit: 1 }],
    pageSetup: {
      paperSize: 9,
      orientation: d.columns.length > 6 ? "landscape" : "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: "1:1",
    },
  });
  sheet.columns = d.columns.map((c) => ({ header: c.label, key: c.key, width: c.width }));
  for (const row of d.rows)
    sheet.addRow(
      Object.fromEntries(
        d.columns.map((c) => [
          c.key,
          row[c.key] === null
            ? null
            : c.type === "money"
              ? row[c.key] / 100
              : c.type === "date"
                ? new Date(row[c.key] + "T00:00:00Z")
                : row[c.key],
        ]),
      ),
    );
  for (const [i, c] of d.columns.entries())
    if (["money", "date"].includes(c.type))
      sheet.getColumn(i + 1).numFmt =
        c.type === "money" ? "#,##0.00;[Red](#,##0.00)" : "yyyy-mm-dd";
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, sheet.rowCount), column: d.columns.length },
  };
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE9EDE8" } };
  sheet.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
  });
  const info = book.addWorksheet("口径与说明");
  info.addRows([
    ["文档", d.title],
    ...def("ledger").fields.map(([k, label]) => [label, d.fields[k]]),
    ["说明", "合成案例材料；金额以元展示；空白字段表示本表未载。"],
  ]);
  info.columns = [{ width: 18 }, { width: 90 }];
  info.eachRow((r) => (r.alignment = { wrapText: true, vertical: "top" }));
  return new Blob([await book.xlsx.writeBuffer()], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
