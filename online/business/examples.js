import { BUSINESS_SCHEMA, definitions, cleanBusiness } from "./model.js";
const para = (text) => ({ type: "paragraph", text }),
  heading = (text) => ({ type: "heading", text }),
  table = (headers, rows, widths = headers.map(() => 1)) => ({
    type: "table",
    headers,
    rows,
    widths,
  });
const customer = "辰澜云智科技（上海）有限公司",
  supplier = "砺舟软件技术（杭州）有限公司",
  contract = "CL-LZ-2026-081";
const items = [
  ["运维平台企业许可", "固定部署范围内，生产1套、测试1套", "1套", "280000.00"],
  ["接口实施及历史数据迁移", "6个接口；2024—2025年工单数据", "1项", "120000.00"],
  ["首年运行维护", "2026-10-01至2027-09-30", "1年", "80000.00"],
];
export function exampleBusiness(kind) {
  const definition = definitions.find((d) => d.id === kind);
  if (!definition) throw Error("未知业务文书");
  const d = {
    schema_version: BUSINESS_SCHEMA,
    id: "demo-" + kind,
    kind,
    title: definition.title,
    fields: {},
    blocks: [],
  };
  const common = {
    number: "CL-2026-091",
    contract,
    order: "CL-PO-0901",
    project: "辰澜运维平台升级",
    buyer: customer,
    customer,
    supplier,
    sender: supplier,
    recipient: customer,
    date: "2026-09-25",
    status: "待双方确认",
    period: "2026年9月",
    interviewee: "周予安",
    role: "交付负责人",
    interviewer: "项目组陈律",
    place: "视频会议",
    confirmation: "记录已发送受访人，尚未收到书面确认",
    attendees: "客户项目经理林聿；供应商项目经理沈南；运维主管周予安",
    recorder: "林聿",
    issuer: customer,
    scope: "运维平台及相关组件",
    reviewDate: "2026-09-30",
    version: "1.2",
    effectiveDate: "2026-08-01",
    basis: "截至制表日已签合同、已收到单据及项目组业务登记；空白表示资料未载，不表示不存在。",
  };
  definition.fields.forEach(([k]) => (d.fields[k] = common[k] || "未载明"));
  if (kind === "order") {
    d.title = "运维平台升级项目订单";
    d.fields.number = "CL-PO-0901";
    d.fields.date = "2026-09-01";
    d.fields.status = "客户已发出，供应商于9月2日邮件确认范围";
    d.blocks = [
      para("本订单依据上述框架合同下达。交付与付款节点以本订单及双方确认的任务书为准。"),
      table(["采购项目", "范围或规格", "数量", "含税金额（元）"], items, [1.3, 2.2, 0.7, 1]),
      para(
        "合计人民币480000.00元，税率及税额以合同约定和实际发票分别列示。首付款192000.00元；中期款、验收款及维护费按合同节点处理。",
      ),
      para(
        "项目联系人：客户林聿，供应商沈南。生产环境上线须另经客户运维窗口批准。订单确认并不代表已交付、已验收或已付款。",
      ),
    ];
  }
  if (kind === "statement-of-work") {
    d.title = "运维平台升级实施任务书";
    d.fields.number = "CL-SOW-0903";
    d.fields.date = "2026-09-03";
    d.blocks = [
      heading("范围与边界"),
      para(
        "供应商负责六个接口适配、工单历史数据迁移和权限规则配置。客户负责提供测试环境和经授权的脱敏数据。工资系统、生产网改造及第三方软件采购不在本次范围。",
      ),
      table(
        ["阶段", "交付内容", "计划日期", "核对方式"],
        [
          ["设计确认", "接口字段映射及权限矩阵", "2026-09-08", "业务与运维双方书面确认"],
          ["测试部署", "安装包、配置及迁移校验清单", "2026-09-18", "测试环境演示及数据抽样"],
          ["生产上线", "上线脚本、回退方案及培训记录", "待窗口批准", "上线后另行组织验收"],
        ],
        [1, 2.5, 1.2, 1.8],
      ),
      heading("项目依赖"),
      para(
        "接口3依赖客户取得原系统服务商的接口开放。样例账户用于测试，不等同于生产账户授权。需求变化应记入变更单，并明确对价格与工期的影响。",
      ),
    ];
  }
  if (kind === "delivery") {
    d.title = "运维平台升级阶段交付清单";
    d.fields.number = "CL-DEL-0918";
    d.fields.date = "2026-09-18";
    d.fields.status = "已上传客户测试文件区；生产部署包尚未交付";
    d.blocks = [
      table(
        ["文件或成果", "版本", "交付方式", "接收记载"],
        [
          ["安装包", "3.2.0-rc2", "测试文件区", "林聿9月18日邮件确认可下载"],
          ["接口映射说明", "1.1", "随包提供", "已收到"],
          ["迁移抽样报告", "0.9", "随包提供", "缺少2024年12月异常工单样本"],
          ["生产回退方案", "未交付", "另行提交", "待提供"],
        ],
        [1.5, 0.9, 1.2, 2],
      ),
      para("交付人：沈南。清单反映本次文件递交范围；测试问题及最终验收结果见后续记录。"),
    ];
  }
  if (kind === "acceptance") {
    d.title = "运维平台升级阶段验收记录";
    d.fields.number = "CL-UAT-0925";
    d.fields.status = "有条件通过";
    d.blocks = [
      table(
        ["测试项目", "标准", "实际记录", "结论"],
        [
          [
            "登录及角色授权",
            "关键角色权限与确认矩阵一致",
            "管理员与普通用户通过；外包角色待复测",
            "部分通过",
          ],
          ["历史数据迁移", "样本字段与原系统一致", "20条中2条附件链接失效", "待修复"],
          [
            "接口调用",
            "六个接口均按任务书返回结果",
            "接口1、2、4、5、6通过，接口3未开放",
            "未完成",
          ],
          ["回退演练", "能够按方案恢复至上线前状态", "仅进行桌面推演，尚未实际演练", "待验证"],
        ],
        [1.1, 1.7, 2.1, 1],
      ),
      heading("处理安排"),
      para(
        "同意进入非生产环境试用。9月30日前补齐附件链接并提交复测记录；接口3按客户协调结果另排时间。当前记录不构成最终验收或生产上线批准。",
      ),
      para(
        "客户记录人：林聿。供应商确认意见：已收到待办清单，对接口3是否计入本轮范围保留意见。双方签署情况：本表尚未盖章。",
      ),
    ];
  }
  if (kind === "supplement") {
    d.title = "接口调整及交付节点补充协议";
    d.fields.number = "CL-ADD-0922";
    d.fields.date = "2026-09-22";
    d.fields.status = "双方项目经理已确认文本，正式签章尚未完成";
    d.blocks = [
      heading("变更事项"),
      para(
        "双方拟将接口3的生产联调节点与其余五个接口分开。供应商应先完成可独立测试部分，并提交接口适配说明及待客户提供事项清单。",
      ),
      heading("价格及原约定"),
      para(
        "本次变更拟不增加合同总价。最终验收及验收款触发条件仍以双方正式签署的文件为准；本稿不确认任何付款已经发生。",
      ),
      heading("签署"),
      para("甲乙双方签章栏留存于最终签署件。现有项目邮件作为沟通记录另行保存。"),
    ];
  }
  if (kind === "reconciliation") {
    d.title = "运维平台升级项目九月对账单";
    d.fields.number = "CL-REC-0930";
    d.fields.date = "2026-09-30";
    d.blocks = [
      table(
        ["项目", "本期金额（元）", "记录依据", "待核事项"],
        [
          ["合同含税总额", "480000.00", "合同及订单", "维护期起算待生产上线确认"],
          ["已登记到账", "192000.00", "9月10日银行收款记录", "已与客户付款申请核对"],
          ["未到付款节点金额", "288000.00", "合同付款安排", "有条件验收不自动触发最终验收款"],
        ],
        [1.3, 1.1, 1.5, 2],
      ),
      para(
        "本单由供应商财务编制，客户尚未签回。开票、确认收入和付款记录分别核对，未列项目不作为已经结清的证明。",
      ),
    ];
  }
  if (kind === "interview") {
    d.title = "交付负责人访谈记录";
    d.dialogue = [
      {
        question: "您负责哪些工作，记录依据主要是什么？",
        answer:
          "我负责排实施人员和客户工单，销售定价和财务到账不由我审批。今天主要按项目群消息和我自己的安排表回忆。",
      },
      {
        question: "本次升级已经完成验收了吗？",
        answer:
          "客户同意先试用，现场大家说可以往下走，但还有两三个问题。正式验收单有没有盖章，我还要找项目经理确认。",
      },
      {
        question: "接口3为什么没有联调？",
        answer:
          "原厂没有给我们生产接口权限。售前沟通时我理解是客户协调，我们把本方适配代码做好，是否算交付完成要再核对任务书。",
      },
      {
        question: "平台代码是否全部由公司独立完成？",
        answer:
          "主程序是我们维护的；报表组件用了开源库，另有一个接口适配器由外部团队写。采购合同和授权文件我这里没有。",
      },
      {
        question: "客户数据迁移是否有批准记录？",
        answer:
          "测试批次应该是脱敏数据，我只看到了样例文件。生产库导出由客户运维执行，邮件由谁确认我不清楚。",
      },
      {
        question: "有什么需要补充给项目组的材料？",
        answer:
          "我可以提供工单汇总和两次测试日志。生产上线窗口及最终验收签署件要向客户项目经理索取。",
      },
    ];
    d.blocks = [para("记录人整理后发送受访人核对；未收到确认的表述暂按访谈记录保存。")];
  }
  if (kind === "email") {
    d.title = "运维平台交付与验收往来邮件";
    d.messages = [
      {
        from: "沈南 <shen.nan@example.invalid>",
        to: "林聿 <lin.yu@example.invalid>",
        cc: "周予安 <zhou.yuan@example.invalid>",
        date: "2026-09-18T16:30:00+08:00",
        subject: "运维平台升级测试包及交付清单",
        body: "林经理：测试包3.2.0-rc2已放到双方约定的测试文件区。附件是交付清单和迁移抽样报告。生产回退方案下周补充。接口3仍等待贵司与原厂协调开放，请确认现阶段可先安排其余部分测试。",
        attachments: ["阶段交付清单.docx", "迁移抽样报告.xlsx"],
        deliveryRecord: "",
      },
      {
        from: "林聿 <lin.yu@example.invalid>",
        to: "沈南 <shen.nan@example.invalid>",
        cc: "周予安 <zhou.yuan@example.invalid>",
        date: "2026-09-19T09:10:00+08:00",
        subject: "回复 运维平台升级测试包及交付清单",
        body: "安装包可以下载。我们会安排测试，最终结果以后续验收记录为准。请先核对附件链接失效的问题。接口3的范围和上线时间还要内部讨论，本邮件先确认收到这些文件。",
        attachments: [],
        deliveryRecord: "",
      },
    ];
    d.blocks = [];
  }
  if (kind === "minutes") {
    d.title = "运维平台升级协调会议纪要";
    d.blocks = [
      heading("讨论事项"),
      para(
        "项目组讨论了试用安排、历史附件链接和接口3联调。供应商建议按已完成部分先出具阶段记录；客户希望保留最终验收条件。",
      ),
      heading("形成的安排"),
      para(
        "9月27日前由供应商重新提供抽样结果；客户于9月29日前反馈生产窗口。各方可先核对阶段验收表，正式签章另行安排。",
      ),
      heading("未决事项"),
      para(
        "接口3是否调整为独立里程碑、首年维护期何日起算，以及异常工单补录的责任尚未一致。参会发言不替代有权限人员正式批准。",
      ),
    ];
  }
  if (kind === "ip-statement") {
    d.title = "运维平台知识产权及第三方组件情况说明";
    d.blocks = [
      para(
        "公司根据研发台账整理以下情况，供项目资料核对。本文由研发部门编制，相关登记及外部许可文件另行提供。",
      ),
      table(
        ["对象", "现有登记或来源", "当前使用记载", "待提供资料"],
        [
          ["运维平台主程序", "软件著作权登记证书", "客户私有化部署", "名称变更补充证明原件"],
          ["接口适配器", "外包团队交付", "接口3代码仍在联调", "开发合同及权利归属条款"],
          ["报表组件", "开源项目", "前端展示与导出", "所用版本及许可清单"],
        ],
        [1.2, 1.6, 1.6, 1.6],
      ),
      para(
        "公司曾就一项专利办理质押登记。财务称相关授信已到期，现有资料只有注销申请稿；是否完成注销登记，仍以登记文件另行核对。",
      ),
    ];
  }
  if (kind === "policy") {
    d.title = "研发成果与第三方组件管理办法";
    d.fields.status = "经理办公会已批准，部门已发布";
    d.blocks = [
      heading("成果登记"),
      para(
        "项目负责人在形成可交付版本后维护代码库、人员贡献及版本说明。涉及合作或委托开发时，登记对应合同和外部团队交付范围。",
      ),
      heading("组件使用"),
      para(
        "新增第三方组件应记录来源、版本、许可文本和使用方式。项目负责人先说明部署及分发场景，再提交研发负责人核对。既有组件补录不改变原使用事实。",
      ),
      heading("对外交付"),
      para(
        "交付清单列明软件、文档及第三方组件清单版本。客户提出扩大许可范围或提供源代码时，按合同和审批权限处理。",
      ),
      heading("资料保管"),
      para(
        "登记证书及变更、质押、许可文件按权利对象归档。注销申请与登记结果分别保存；台账状态应有对应业务文件支持。",
      ),
    ];
  }
  if (kind === "ledger") return exampleLedger("contracts");
  return cleanBusiness(d);
}
export const ledgerNames = {
  contracts: "合同与收款台账",
  ip: "知识产权台账",
  personnel: "人员资质台账",
  leases: "办公场所租赁台账",
  subsidies: "政府补助台账",
  projects: "项目履行台账",
};
export function exampleLedger(type = "contracts") {
  const text = (key, label, width = 22) => ({ key, label, type: "text", width }),
    money = (key, label) => ({ key, label, type: "money", width: 20 }),
    date = (key, label) => ({ key, label, type: "date", width: 16 });
  const d = {
    schema_version: BUSINESS_SCHEMA,
    id: "demo-ledger-" + type,
    kind: "ledger",
    title: ledgerNames[type],
    fields: {
      issuer: customer,
      period: "截至2026年9月30日",
      date: "2026-09-30",
      basis: "按已收业务单据逐笔登记，金额以元展示；空白表示本表未载。",
    },
    blocks: [],
  };
  if (type === "contracts") {
    d.columns = [
      text("contract", "合同编号"),
      text("counterparty", "相对方", 36),
      money("amount", "合同含税金额（元）"),
      money("received", "已登记收款（元）"),
      money("pending", "未到节点金额（元）"),
      text("status", "状态", 40),
    ];
    d.rows = [
      {
        contract,
        counterparty: supplier,
        amount: 48000000,
        received: 19200000,
        pending: 28800000,
        status: "阶段有条件通过；最终验收未完成",
      },
    ];
  }
  if (type === "ip") {
    d.columns = [
      text("name", "权利名称", 36),
      text("number", "登记或专利号", 26),
      text("originalOwner", "原证权利人", 35),
      text("currentRecord", "后续记载", 45),
      text("security", "负担资料", 45),
    ];
    d.rows = [
      {
        name: "辰澜运维平台V3.2",
        number: "SYN-SW-2024-001",
        originalOwner: "辰澜信息技术（上海）有限公司",
        currentRecord: "软件名称变更补充证明，2026-03-18",
        security: "未载明",
      },
      {
        name: "一种设备异常识别方法",
        number: "SYN-PT-2022-001",
        originalOwner: "辰澜信息技术（上海）有限公司",
        currentRecord: "名称变更手续合格通知，2026-02-18",
        security: "2024年质押；2026年9月有注销申请稿，无登记结果",
      },
    ];
  }
  if (type === "personnel") {
    d.columns = [
      text("name", "姓名"),
      text("role", "岗位"),
      text("qualification", "资格或证书", 36),
      text("number", "编号"),
      date("expires", "有效期至"),
      text("record", "资料情况", 45),
    ];
    d.rows = [
      {
        name: "周予安",
        role: "交付负责人",
        qualification: "项目管理相关培训证明",
        number: "SYN-TRAIN-101",
        expires: "2027-06-30",
        record: "已收复印件；发证机构核验记录未载",
      },
    ];
  }
  if (type === "leases") {
    d.columns = [
      text("premises", "场所", 35),
      text("lessor", "出租方", 35),
      date("from", "租期开始"),
      date("until", "租期结束"),
      money("monthly", "月租金（元）"),
      text("record", "文件情况", 45),
    ];
    d.rows = [
      {
        premises: "上海市浦东新区云杉路168号8层（虚构）",
        lessor: "栖川园区运营有限公司",
        from: "2025-01-01",
        until: "2027-12-31",
        monthly: 5600000,
        record: "合同已收，产权及转租授权待补",
      },
    ];
  }
  if (type === "subsidies") {
    d.columns = [
      text("project", "项目", 36),
      text("document", "立项文件"),
      money("approved", "核定金额（元）"),
      money("received", "已登记到账（元）"),
      date("deadline", "项目验收期限"),
      text("condition", "条件及进度", 45),
    ];
    d.rows = [
      {
        project: "工业软件研发专项",
        document: "SYN-TECH-2025-08",
        approved: 100000000,
        received: 60000000,
        deadline: "2026-12-31",
        condition: "尾款与项目验收挂钩；进度报告准备中",
      },
    ];
  }
  if (type === "projects") {
    d.columns = [
      text("contract", "合同编号"),
      text("order", "订单编号"),
      text("delivery", "交付文件"),
      text("acceptance", "验收记载", 35),
      text("payment", "付款记录"),
      money("allocated", "本项目分配金额（元）"),
      text("record", "核对说明", 40),
    ];
    d.rows = [
      {
        contract,
        order: "CL-PO-0901",
        delivery: "CL-DEL-0918",
        acceptance: "CL-UAT-0925 有条件通过",
        payment: "2026-09-10首付款",
        allocated: 19200000,
        record: "不因登记首付款而确认最终验收",
      },
    ];
  }
  if (!d.columns) throw Error("未知台账模板");
  return cleanBusiness(d);
}
