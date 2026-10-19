# 尽调材料制作第二批交接

版本：1.2.0，2026-10-19。本次在第一批工作副本上继续开发，包含第一批全部功能。协议仍为 `material-batch/1`，制件版本为 `material-render/1.2.4`。仅完成本地开发与验收，尚未向线上工作台发布。

## 开发和试用

使用 Node.js 24，执行 `npm ci`、`npm run dev`，打开 `http://127.0.0.1:3016/`。已有开发服务使用同一端口，不要同时启动第二个进程。

- `/contracts/`：合同正文、变量和附件表格编辑，导出 DOCX。
- `/business/`：订单、验收、沟通文书和业务台账，支持直接编辑、方案导入导出和送入批量制作。
- `/rights/`：在专利、商标、软著记录中选择新增文书；原始证书与变更、质押分别保存，不改写原证历史。
- `/certificates/`：选择五类新增科技资质的“通用合成证明版”。
- `/batch/`：点击“载入尽调材料示例”，再制作、下载业务材料及制作记录。也支持动态发现的八个 WebMCP 工具，字段和顺序见 [BATCH_API.md](online/public/BATCH_API.md)。

`npm test` 包含旧页面与合同检查、第一批 11 组回归、第二批 7 组检查及下载回收器 6 项测试。需要 Python 3 和 Poppler。`npm run build` 先生成 schema 和示例，再构建 `dist/client/` 静态站点；部署方式沿用项目原有说明。

## 新增了什么

合同增加九类：软件委托开发、软件许可、SaaS 与云服务、实施与运维、渠道经销、合作研发、OEM、产品设备采购、办公租赁。每类含业务专属条款、共同条款、签署页和四组附件，附件为真实可编辑 Word 表格。内置示例约 3,500 至 3,650 字，当前示例渲染为 11 页；页数是排版结果，不是生成门槛。原有三类合同保留。

业务文书增加十一类：订单、任务书、交付清单、阶段验收记录、补充协议、结算对账单、访谈记录、往来邮件、会议纪要、知识产权情况说明、内部管理制度。验收记录可保存条件、遗留问题及签章状态；邮件保留发件人、收件人、时区、附件名与独立回执记载；访谈以问答保存，并记录受访人确认情况。

台账提供合同收款、知识产权、人员资质、办公租赁、政府补助及项目履行六套字段示例，也可自行增删列。XLSX 保留编号前导零、日期和数值类型。输入 money 类型为整数分，输出显示元；空值不改成零。CSV 对文本公式注入做转义，合法负数金额保持数值。业务台账当前不提供公式计算，不能据此宣称完成了模型工作簿复算。

权属新增七种文书：专利变更手续合格通知、授予专利权通知、专利质押登记通知、质押注销申请、质押登记注销通知、商标注册事项变更证明、软著登记事项变更或补充证明。专利质押使用独立字段与专用文书，不套动产担保标题。变更前、变更后及原证分别保留；软件和商标的名称地址变更证明不能替代权利转让文件。注销申请与注销结果分别制作。

科技资质新增高新技术企业、ITSS、SPCA 软件能力成熟度、知识产权管理体系、等保备案。sample 的软件成熟度证书是 SPCA，不能标为 CMMI；CMMI 专用模板仍待提供参考。五类目前提供字段结构与通用合成版式，未承诺覆盖所有年代和发证机构的官方样式。模板范围见 `get_capabilities` 的 `scope_notes`；等保备案不自动表示测评通过，未记载的有效期不推算。

## sample 怎样使用

本地 sample 中的软件服务合同、采购合同、访谈记录、专利变更、质押通知和科技资质用于参考文书结构和字段。用户补充的软著变更证明图片用于核对标题、变更事项、编号、序列号及“与原证一并使用”的说明。原始图片与客户材料未放入公开模板资源。

新示例使用合成主体和业务数据。业务文书中的订单、交付、附条件验收和收款台账构成一条小型演示链；全类型批次另外包含多种独立合同及权属状态示例，共 38 份文档、44 个文件，用于验证类型覆盖。它不是已经过案件事实核对的完整评测题，不能把这 38 份全部直接作为同案 Reference 发放。

## 与 Reference 管线对齐

现有管线的 `finance / contracts / certificates / rights / native` producer 不需要全部改成新名字。

合同使用 `contracts`，权属变更和专利质押使用 `rights`，科技资质使用 `certificates`。从 `get_template` 获取完整模板及示例，替换成冻结事实，再 validate、stage、读回输入、render、下载两包。普通背景材料、访谈邮件和台账可使用当前管线的 `native`，在 Worker 内调用本地工具：

```sh
node tools/render-native-business.mjs \
  --input online/public/examples/native-business/acceptance.json \
  --output /absolute/path/workspace/output/native_acceptance

node tools/render-native-business.mjs \
  --input online/public/examples/native-business/ledger-contracts.json \
  --output /absolute/path/workspace/output/native_contracts \
  --formats xlsx,csv
```

将 `online/business/`、`online/shared/word.js`、该 CLI 和锁定依赖一起装入 Worker 资源包。输入采用 `business-document/1`，17 份可改写示例位于 `online/public/examples/native-business/`。工具输出 `candidate/` 与 `authoring/native_delivery_manifest.json`，记录实际文件哈希、producer=native、origin=null、生成方式及 `inspection=NOT_PERFORMED`。相同输入及格式再次调用会核对哈希并复用文件；修改输入需使用新输出目录。

新增浏览器业务文书模块也能通过同一批量接口制作，但真实 producer 为 `business`。后端若采用这一路线，须同步扩展计划 schema、路由及 gate；不能把浏览器产物改标为 native 或其他工作台。全类型验收包保留真实 `business` 标记，供开发检查。

工作台材料实际下载后用 `tools/collect_workbench.py` 回收。它核对实际 origin、ZIP 路径、文件哈希、大小及内容白名单，保留 raw 与 candidate 原字节。随后仍由管线按资源包规约生成正式 receipt、reference_bundle，执行独立 inspect/check 和专家审核。

## 字体、格式和复检

新知识产权文书与科技资质采用 SVG 固定标签和填写字段，可检索 PDF 包含两者的实际文字。浏览器生成 PNG 时嵌入项目自带的 Noto Sans SC 字体，缺少字体加载能力会报错，不继续输出缺字版。旧证照图片底图中的文字仍需 OCR 或原图检查。

合同和普通业务文书原生输出 DOCX，需要 PDF 时由 Worker 对已核对的原件转换并记录来源哈希。转换环境必须具有中文字体。项目已含 Noto Sans SC 和许可证；可生成任务内 Fontconfig 配置：

```sh
node tools/prepare-fontconfig.mjs --output /absolute/path/task/fonts.conf
# 将打印的路径设为转换进程的 FONTCONFIG_FILE，再调用已安装的 LibreOffice。
```

本地 Word 渲染发现并修复了附件表格样式缺失；已检查新合同所有页以及业务文书版面。不要仅用 DOCX 内存在文字、文件大小或工作台节点成功作为文档验收依据。

工作台成功表示文件已保存，下载请求表示浏览器已触发下载，回收成功表示 Worker 已读到并核对文件。这些都不等于 QC 通过。独立质检应对照冻结事实检查实际正文、签署与履行状态、日期金额、权属链、跨材料关系和版面；有意矛盾由私有作者计划解释，不能把题目设计自动纠正掉。

## 本次验收与后续接入

已完成全部自动检查及本地生产构建，浏览器真实制件、下载双包和回收通过：38 份文档、44 个文件。新的 12 个固定版式 PDF 可提取中文，页数与制作记录一致；六套 XLSX/CSV 通过类型、整数分和原字节哈希核对；六份实际下载 XLSX 的行列及每个字段均与冻结输入匹配。业务文书编辑后的未完成草稿可保存并在刷新后恢复，表格修改也已验证写入实际下载的 Word。17 类普通文书和台账通过 native CLI 独立制件，共生成 23 个文件。

最新 Reference YAML 对应的 `legal-reference-workspace-bundle@27` 完整资源文件不在当前交接目录，本轮未在 Forge Worker 内执行其整轮 gate，也未修改线上 YAML、资源包或发布域名。后端接入时先装入本地 native 制件工具，再用任务允许的真实工作台 origin 执行 preflight、文件回收及独立复检；本机开发地址仅供本地验收。
