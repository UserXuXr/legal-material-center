import { LetterPages } from "../../../shared/svg-pages.js";
import type { RecordItem } from "./registry";
const field = (
  key: string,
  label: string,
  section: string,
  type = "textarea",
  extra: any = {},
) => ({ key, label, section, type, max: 6000, ...extra });
export const extensionViews: any = {
  patent: [
    { id: "change", name: "变更手续合格通知书" },
    { id: "grantNotice", name: "授予专利权通知书" },
    { id: "pledgeRegistration", name: "专利权质押登记通知书" },
    { id: "pledgeReleaseRequest", name: "质押注销登记申请书" },
    { id: "pledgeCancellation", name: "质押登记注销通知书" },
  ],
  trademark: [{ id: "change", name: "变更证明" }],
  software: [{ id: "change", name: "登记事项变更或补充证明" }],
};
const changeFields = [
  field("changeNo", "变更证明或通知编号", "变更事项", "text"),
  field("changeSubject", "变更或补充事项", "变更事项"),
  field("changeNature", "本次事项性质", "变更事项", "select", {
    options: ["名称或地址变更", "权利转移登记", "登记事项变更或补充"],
  }),
  field("changeBefore", "变更前记载", "变更事项"),
  field("changeAfter", "变更后内容", "变更事项"),
  field("changeDate", "证明或通知日期", "变更事项", "date"),
  field("changeIssuer", "出具机构", "变更事项", "text"),
  field("changeNotes", "其他记载", "变更事项"),
  field("changeSerial", "证明印制流水号", "变更事项", "text"),
];
export const extensionFields: any = {
  patent: [
    ...changeFields,
    field("noticeNo", "授予通知发文号", "授予通知", "text"),
    field("noticeDate", "授予通知发文日", "授予通知", "date"),
    field("noticeApplicant", "通知载明申请人", "授予通知", "text"),
    field("noticeText", "通知内容及办理事项", "授予通知"),
    field("pledgeNumber", "专利权质押登记号", "专利质押", "text"),
    field("pledgeApplicationDate", "质押登记申请日", "专利质押", "date"),
    field("pledgeDate", "质押登记日", "专利质押", "date"),
    field("pledgeNoticeDate", "质押通知发文日", "专利质押", "date"),
    field("pledgor", "登记载明出质人", "专利质押"),
    field("pledgee", "登记载明质权人", "专利质押"),
    field("pledgedPatents", "出质专利清单", "专利质押"),
    field("pledgeContract", "质押合同及主合同记载", "专利质押"),
    field("pledgeScope", "登记载明的担保范围", "专利质押"),
    field("pledgeRecord", "本次质押登记记载", "专利质押"),
    field("pledgeIssuer", "登记机构", "专利质押", "text"),
    field("releaseApplicationDate", "注销登记申请日", "质押注销", "date"),
    field("releaseReason", "申请注销原因及提交文件", "质押注销"),
    field("cancellationDate", "注销登记日", "质押注销", "date"),
    field("cancellationNoticeDate", "注销通知发文日", "质押注销", "date"),
    field("cancellationNo", "注销通知发文号", "质押注销", "text"),
    field("cancellationRecord", "注销登记通知内容", "质押注销"),
  ],
  trademark: changeFields,
  software: changeFields,
};
export function extensionRequired(kind: string, view: string): string[] {
  if (view === "change")
    return [
      "title",
      "number",
      "changeNo",
      "changeSubject",
      "changeNature",
      "changeAfter",
      "changeDate",
      "changeIssuer",
    ];
  if (view === "grantNotice")
    return ["title", "number", "noticeNo", "noticeDate", "noticeApplicant", "noticeText"];
  if (view === "pledgeRegistration")
    return [
      "title",
      "number",
      "pledgeNumber",
      "pledgeApplicationDate",
      "pledgeDate",
      "pledgeNoticeDate",
      "pledgor",
      "pledgee",
      "pledgedPatents",
      "pledgeRecord",
      "pledgeIssuer",
    ];
  if (view === "pledgeReleaseRequest")
    return [
      "title",
      "number",
      "pledgeNumber",
      "pledgor",
      "pledgee",
      "pledgedPatents",
      "releaseApplicationDate",
      "releaseReason",
    ];
  if (view === "pledgeCancellation")
    return [
      "title",
      "number",
      "pledgeNumber",
      "pledgor",
      "pledgee",
      "cancellationNo",
      "cancellationDate",
      "cancellationNoticeDate",
      "cancellationRecord",
      "pledgeIssuer",
    ];
  return [];
}
export function extensionErrors(record: RecordItem, views: string[]): string[] {
  const v = record.fields,
    errors: string[] = [];
  if (views.includes("change") && record.kind !== "patent" && v.changeNature === "权利转移登记")
    errors.push(
      "本变更证明用于登记事项补充或名称地址变更；实际权利转移需另用对应登记文件，不能套用本证明",
    );
  const before = (a: string, b: string, label: string) => {
    if (v[a] && v[b] && v[a] > v[b]) errors.push(label);
  };
  if (views.includes("pledgeRegistration")) {
    before("pledgeApplicationDate", "pledgeDate", "质押申请日不能晚于登记日");
    before("pledgeDate", "pledgeNoticeDate", "质押通知日期不能早于登记日");
  }
  if (views.includes("pledgeCancellation")) {
    before("pledgeDate", "cancellationDate", "注销登记日不能早于原质押登记日");
    before("cancellationDate", "cancellationNoticeDate", "注销通知日期不能早于注销登记日");
  }
  // Application and cancellation are independent documents; a release request never updates the register.
  return errors;
}
export function extensionExample(kind: string, view: string) {
  const change = {
    changeNo: "SYN-CH-2026-018",
    changeSubject:
      kind === "software"
        ? "软件名称"
        : kind === "trademark"
          ? "注册人名义、地址"
          : "专利权人名称、地址",
    changeNature: kind === "software" ? "登记事项变更或补充" : "名称或地址变更",
    changeBefore:
      kind === "software"
        ? "辰澜工业设备运维管理软件 V4.0"
        : "辰澜信息技术（上海）有限公司；上海市云杉路88号（虚构）",
    changeAfter:
      kind === "software"
        ? "辰澜智能运维协同平台 [简称：辰澜运维] V4.0"
        : "辰澜云智科技（上海）有限公司；上海市云杉路168号（虚构）",
    changeDate: "2026-03-18",
    changeIssuer: kind === "software" ? "软件登记机构（样本）" : "知识产权登记机构（样本）",
    changeNotes: "其他登记事项按原证及本次文件分别核对。",
    changeSerial: "SYN-NO-03766159",
  };
  const pledge = {
    pledgeNumber: "SYN-Y-2024-0337",
    pledgeApplicationDate: "2024-11-09",
    pledgeDate: "2024-11-11",
    pledgeNoticeDate: "2024-11-16",
    pledgor: "辰澜信息技术（上海）有限公司",
    pledgee: "澄川银行上海科创支行（虚构）",
    pledgedPatents: "一种工业设备运行状态的异常识别方法 | ZL 2022 1 0000123.0（样本）",
    pledgeContract: "质押合同CL-PL-2024-01；授信合同CL-CR-2024-01",
    pledgeScope: "登记记载为合同约定的主债权及担保范围；实际债务余额另行核对。",
    pledgeRecord: "本次质押登记的设立事项按上列日期记载，列入专利登记簿。",
    pledgeIssuer: "知识产权登记机构（样本）",
    releaseApplicationDate: "2026-09-28",
    releaseReason: "申请人称主债权已清偿，拟提交双方签章申请及结清证明；本稿待签章。",
    cancellationDate: "2026-09-30",
    cancellationNoticeDate: "2026-09-30",
    cancellationNo: "SYN-PL-CANCEL-2026-01",
    cancellationRecord: "对登记号SYN-Y-2024-0337办理注销登记，本通知反映本次注销登记结果。",
  };
  return {
    ...change,
    ...(kind === "patent"
      ? {
          ...pledge,
          noticeNo: "SYN-GRANT-2024-01",
          noticeDate: "2024-05-15",
          noticeApplicant: "辰澜信息技术（上海）有限公司",
          noticeText:
            "经审查作出授予发明专利权的通知。登记手续、授权公告及发证信息应与对应后续文件分别核对。",
        }
      : {}),
  };
}
export function renderExtension(record: RecordItem, view: string) {
  const names = extensionViews[record.kind]?.find((v: any) => v.id === view);
  if (!names) return null;
  const f = record.fields,
    isSoftware = record.kind === "software";
  const title = isSoftware
    ? "计算机软件著作权登记事项变更或补充证明"
    : record.kind === "trademark"
      ? "商标注册事项变更证明"
      : names.name;
  const number =
    view === "change"
      ? f.changeNo
      : view === "grantNotice"
        ? f.noticeNo
        : view === "pledgeReleaseRequest"
          ? f.pledgeNumber
          : view === "pledgeCancellation"
            ? f.cancellationNo
            : f.pledgeNumber;
  const c = new LetterPages(title, {
    subtitle: isSoftware
      ? "中华人民共和国国家版权局（样本）"
      : record.kind === "trademark"
        ? "商标注册事项"
        : "专利登记事项",
    number:
      (view === "pledgeRegistration" ? "专利权质押登记号：" : "编号：") + (number || "未载明"),
    color: isSoftware ? "#278f91" : "#2f4551",
  });
  if (view === "change") {
    if (isSoftware)
      c.paragraph("根据《计算机软件著作权登记办法》相关规定，对以下登记事项予以变更或补充：");
    c.pair(
      isSoftware ? "原登记号" : record.kind === "trademark" ? "商标注册号" : "申请号或专利号",
      f.number,
    );
    if (!isSoftware) c.pair("名称", f.title);
    c.pair("变更或补充事项", f.changeSubject);
    if (f.changeBefore) c.pair("变更前记载", f.changeBefore);
    c.pair("变更后内容", f.changeAfter);
    if (f.changeNotes) c.paragraph(f.changeNotes);
    c.sign(f.changeIssuer || "未载明", f.changeDate || "未载明");
  } else if (view === "grantNotice") {
    c.pair("申请号或专利号", f.number);
    c.pair("发明创造名称", f.title);
    c.pair("通知载明申请人", f.noticeApplicant);
    c.heading("通知事项");
    c.paragraph(f.noticeText);
    c.sign("知识产权登记机构（样本）", f.noticeDate || "未载明");
  } else {
    if (view !== "pledgeRegistration") c.pair("专利权质押登记号", f.pledgeNumber);
    c.pair("关联专利号", f.number);
    c.pair("出质人", f.pledgor);
    c.pair("质权人", f.pledgee);
    if (view === "pledgeReleaseRequest") {
      c.pair("申请日期", f.releaseApplicationDate);
      c.heading("注销申请事项");
      c.paragraph(f.releaseReason);
      c.pair("出质专利清单", f.pledgedPatents);
      c.paragraph("申请人签字或盖章栏：\n出质人：\n质权人：");
      c.paragraph("本文件为注销登记申请，不是注销登记结果。");
    } else if (view === "pledgeCancellation") {
      c.pair("注销登记日期", f.cancellationDate);
      c.heading("注销登记事项");
      c.paragraph(f.cancellationRecord);
      c.sign(f.pledgeIssuer || "未载明", f.cancellationNoticeDate || "未载明");
    } else {
      c.paragraph(
        "质押登记申请日期：" + f.pledgeApplicationDate + "    质押登记日期：" + f.pledgeDate,
      );
      c.pair("合同记载", f.pledgeContract);
      c.heading("登记内容");
      c.paragraph(f.pledgeRecord);
      if (f.pledgeScope) c.paragraph(f.pledgeScope);
      c.heading("出质专利清单");
      c.table(
        ["专利名称", "申请号或专利号"],
        (f.pledgedPatents || "未载明 | 未载明")
          .split("\n")
          .filter(Boolean)
          .map((row) => {
            const a = row.split("|");
            return [a[0].trim(), a.slice(1).join("|").trim()];
          }),
        [3, 2],
      );
      c.sign(f.pledgeIssuer || "未载明", f.pledgeNoticeDate || "未载明");
    }
  }
  return c.finish().map((page: any) => ({
    ...page,
    svg: isSoftware
      ? page.svg
          .replace(
            "<g font-family=",
            '<rect x="25" y="25" width="744" height="1073" fill="none" stroke="#76b9b3" stroke-width="3"/><rect x="34" y="34" width="726" height="1055" fill="none" stroke="#b7ccc1" stroke-width="2"/><g font-family=',
          )
          .replace(
            "</g></svg>",
            '<text x="64" y="1018" font-size="13" fill="#425e59">注：此变更证明同计算机软件著作权登记证书一并使用。</text><text x="64" y="1036" font-size="12" fill="#425e59">No. ' +
              String(f.changeSerial || "未载明").replace(/[&<>"']/g, "") +
              "</text></g></svg>",
          )
      : page.svg,
    recordId: record.id,
    kind: record.kind,
    view,
    name: f.title + "_" + names.name + "_" + page.page,
    template: record.kind + "-" + view + "-structure-v1",
  }));
}
