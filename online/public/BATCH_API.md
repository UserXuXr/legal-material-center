# Reference 管线与工作台对接

当前版本为 1.2.0，`/batch/` 供五类制件引擎共用。第二批尽调材料与接入说明见仓库根目录 `PHASE2_HANDOFF.md`。原有单份编辑页面、方案 JSON 和 localStorage 键继续保留。财务、权属页面的整批按钮会将当前方案送入批量入口。

当前协议是 `material-batch/1`，以页面 `get_capabilities` 返回的实际能力和 `reference-workbench-v1.schema.json` 为准。此前优化方案中的 `workbench-batch/2.0-proposal` 是设计示例，不能直接导入。

## Agent 调用顺序

1. 从任务配置的工作台首页进入 `batch/`。每次动态发现 WebMCP 工具，按基础名称或 title 匹配；浏览器附加的 UUID 后缀不能硬编码。
2. `get_capabilities({})`：核对本轮实际需要的 producer、材料类型、字段与格式。
3. `get_template({engine, template_id})`：读取完整内置示例。合同返回模板快照和填好字段的案件；财务返回完整 Project。自定义合同可使用原编辑器导出的案件 JSON，或按合同 schema 提交完整正文，工作台不会将自由背景自动扩写。
4. `validate_batch(request)`：只检查，不生成、不改写输入。返回逐文档问题；工作台检查不代替计划 gate。
5. `stage_batch(request)`：保存已冻结输入。每份文档有稳定 `document_id` 和正整数 `revision`。再次提交相同内容会复用产物；修改内容必须增加该文档 revision。
6. `get_job_status({batch_id, include_input:true})`：读回真实已保存 payload，与冻结事实核对。默认不返回私有输入。
7. `render_batch({batch_id})`：逐份生成并保存文件。返回 succeeded / partial / failed；一份失败不丢弃其他完成文件。
8. `retry_documents({batch_id, document_ids:[...]})`：只重试失败或中断的指定文档。修正文档内容时先增加 revision 并 stage，再 render。已成功文档不会重复制作。
9. 分别调用 `export_package({batch_id, profile:"candidate"})` 与 `export_package({batch_id, profile:"authoring"})`。只有明确传 `allow_partial:true` 才能导出部分完成结果；部分完成不能当作完整 Reference。

无 WebMCP 时使用同一页面的“导入方案或批次”“查看或编辑批次 JSON”“制作 / 继续剩余文档”和下载按钮。仍需真实浏览器执行生成和下载。

## 批次结构

每批包括 `schema_version`、`batch_id`、自然业务批次名称 `name` 和 `documents`。每份文档包括：

- `document_id`：稳定业务文档身份。多个格式使用同一个 ID；同一流水全部页为一份文档。
- `revision`：正整数版本。未变文件保留原字节，变更文档重新制作。工作台保存当前批次；每轮旧版材料、制作记录和回收清单由 Forge 另存归档，返修前应先完成上一轮回收。
- `title`：自然业务名称，不放 plan job ID、artifact ID 或制作说明。
- `engine`：finance / contracts / certificates / rights / business。前四类与现有 Pipeline producer 对应；business 为新增浏览器引擎，当前管线可使用下述 native 本地制件路线。
- `formats`：本份约定输出格式数组。
- `pdf_mode`：searchable（默认）或 image。Reference 新合成任务使用 searchable；图像模式仅供有明确用途的归档。
- `appearance`：digital（默认）或 scan，仅控制彩色／灰度，不改变事实。
- `payload`：本模块完整结构化输入。

完整可运行的最小例子见 `examples/reference-smoke.batch.json`。页面“四模块示例”含 30 份独立文档；工作台不把 30 份设为每个小批次的最低值。正式任务数量政策仍由 Forge 校验。

### 模块 payload

- finance：`{project, kind, transaction_id?, stage?, voucher_variant?}`。project 为财务 version 1；kind 为 invoice / receipt / statement / voucher。流水不需要 transaction_id，其余必须匹配 project.transactions[].id。凭证 stage 为 invoice / payment；voucher_variant 为 ledger / business。支持 PDF、PNG、SVG、XLSX、CSV。财务表格仅导出当前业务文档的字段，去掉制作来源标签；公式仍须由管线按需要独立复算。
- rights：`{record, view}`。record 为权属 RecordItem，view 必须属于该 kind 支持的文书。支持 PDF、PNG、SVG。已支持专利变更、授予通知、质押登记、质押注销申请及注销通知，另支持商标及软著变更证明。域名、股东名册等未实现材料不应路由到这里。
- contracts：`{draft}`，draft 是合同 schema 1 完整案件快照，包含 template、clauses、values 等。新增九类软件服务与经营合同，正文及附件采用可编辑段落和真实 Word 表格。仅支持 DOCX；不要规划工作台直接输出合同 PDF。需要 PDF 时由 Pipeline 按已核对 DOCX 另行转换并记录来源哈希。
- certificates：`{project}`，project 是企业证照 version 1 方案。支持 PDF、PNG、SVG；保留日期匹配和未载字段规则。新增高新、ITSS、SPCA、知识产权管理体系及等保备案五种通用合成证明版，具体版式覆盖以 capabilities 的 scope_notes 为准。

- business：`{document}`，document 为 `business-document/1`。普通文书支持 DOCX；台账支持 XLSX、CSV 和 DOCX。字段、表格、问答及邮件均可编辑。金额字段使用整数分，导出的表格显示元。未载金额保存为空值，不补零。

XLSX/CSV 与同件其他格式共用文档身份。权属和证照仍不支持 XLSX。当前 Reference 的普通文书和台账可调用仓库自带工具：

```sh
node tools/render-native-business.mjs \
  --input online/public/examples/native-business/acceptance.json \
  --output /absolute/path/workspace/output/native_acceptance
```

该工具使用和浏览器业务文书模块相同的模型与制件代码，真实记录 producer=native、origin=null，输出 candidate 文件及 authoring/native_delivery_manifest.json。完整输入未变时重复调用会核对并复用已保存文件；修改内容使用新输出目录。它不提供工作台下载回执、QC 或批准。浏览器 business 批次则真实记录 producer=business；后端扩展 producer 契约后才能接入这一路线，不能改名冒充旧 producer。

## 与 latest-production Reference 各节点对应

- plan_reference：规划、事实冻结、依赖、数量、授权与检查目标仍在 Forge 完成。本批次接收已具备独立制件输入的工作台文档，不自动执行 plan 中的 native 作业或修改 plan。
- preflight_workbench：只检查所需模板和格式，用一个获准的小批次完成真实导出和回收测试。按钮或工具存在不等于下载可用。本地 `127.0.0.1:3016` 是开发验收地址，不能在生产网络政策禁止 loopback 时作为替代 origin。
- produce_reference：按 payload_path 底稿构造批次；稳定 document_id 可沿用计划身份，job/artifact 映射只在作者侧维护。先读回输入，再制作和导出两个包。
- inspect_reference / check_reference：读取实际下载文件及冻结台账，独立检查正文、版面、隐藏内容和财务关系。工作台 succeeded 只说明制件已保存，不是 QC PASS。
- repair_reference / revision：仅增加获准文档版本；保留未变文档文件和哈希。工作台不会自动扩大 editable_artifact_ids 授权范围，也不批准任务。

## 文件与真实回收

业务包只含 `Reference/自然业务名称.ext`，不夹带方案或来源标签。重名文件使用自然序号区分。制作记录包包含：

- 制作记录.json：逐文档状态、真实文件哈希、大小、页数、模板版本和输入摘要。
- 文件映射.json：document_id / artifact_id / producer 与业务包自然文件名的映射，含 business_document=true。
- 冻结输入.json：工作台收到的原始输入，不向被测模型发放。
- observed_financial_ledgers.json：流水输入及排序的整数分辅助记录，与 Pipeline financial_ledgers 的字段对应；仅供核对，不能覆盖计划冻结的业务期望或冒充财务核对通过。

`export_package` 返回 download_requested，含实际 ZIP 大小及文件映射。它不会宣称 Forge 已收到文件。

Worker 实际回收两个 ZIP 后，可使用仓库中的收集器：

```sh
python3 tools/collect_workbench.py \
  --business-package /absolute/path/business.zip \
  --authoring-package /absolute/path/authoring.zip \
  --expected-origin https://www.defiuris.com \
  --output /absolute/path/workspace/output/workbench_import
```

收集器检查 ZIP 路径、文件白名单、宏和外链、实际字节哈希、大小与 origin；保留 raw 与 candidate 原字节，生成 workbench_delivery_manifest.json。不会创建 QC PASS、Approval 或最终 reference_bundle，也不覆盖不同内容的历史文件。正式的 receipts/<job_id>.json 和 reference_bundle 仍须按当前资源包规约填写，可引用该真实回收记录。

本地验收把 expected-origin 改成 `http://127.0.0.1:3016`。上线后使用任务配置允许的实际 origin，不通过放宽网络政策解决接入。

## PDF 与测试边界

财务和权属 PDF 保留原始版面，加入由 SVG 实际文字构成的文字层。新知识产权文书与科技资质模板的标签和字段均为 SVG 文字，可一并检索。旧证照的底图图片文字不包含在文字层中，其可检索范围主要是填写字段。必须依赖底图文字的任务仍需相应检查。多页流水在单份及整批路径中均合并为一个 PDF。

第一批测试覆盖旧证照/合同、实际 PDF 提取与逐像素版面对比、IndexedDB 恢复、逐份重试、版本保护、交付隔离和安全下载回收。接入线上 Forge 后还应以实际发布版本和资源包 gate 完成整轮联调。

第二批独立示例见 `examples/due-diligence-smoke.batch.json`，38 份文档、44 个文件，用于检验全部新类型，不能直接当作同一案件的完整 Reference。合同与业务文书无内置 PDF 转换；Worker 转换时需具备中文字体，可用 `node tools/prepare-fontconfig.mjs` 生成任务内字体配置。
