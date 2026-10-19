# 工作台第一批开发交接

版本：1.1.0。日期：2026-10-19。

本版按 `latest-production/legal-reference.yaml` 的生产分工接入：Forge 冻结业务事实、规划作业并执行独立质检；工作台按结构化输入制作文件，保存逐文档结果，提供实际下载和制作记录。原始交接包保持原样，当前目录是开发副本。

## 本地测试

```sh
npm ci
npm run dev
```

打开 `http://127.0.0.1:3016/batch/`，载入“四模块示例”，即可制作 30 份业务文档。也可以导入 `online/public/examples/reference-smoke.batch.json`，单独测试财务、权属、合同、证照各一份。小批次允许少于 30 份，正式 Reference 的最低数量仍由 Forge 的任务配置校验。

推荐 Node.js 24。完整检查为 `npm test` 和 `npm run build`；测试需要 Python 3 和 Poppler。构建目录为 `dist/client/`，沿用现有 GitHub Pages 发布流程。设置 `VITE_BASE_PATH` 时，批量入口和模块链接沿用该路径。

## 本轮实现

- 新增 `/batch/`，四模块共用批次 JSON 和 8 个 WebMCP 工具。Agent 可先读能力和完整示例，再保存输入、读回核对、生成、查询、重试和下载。没有 WebMCP 的浏览器可使用 JSON 导入与页面按钮。
- 财务、权属 PDF 保留原版面并加入实际 SVG 文字层。证照填写字段保留可提取文字；底图图片内的固定文字没有自动 OCR。
- 一份多页流水合并为一个 PDF，页序完整，业务文档计数为 1。财务支持同件 PDF、XLSX、CSV；合同当前输出 DOCX。
- 每完成一份即保存文件和 SHA256。其他文档失败后，成功文件仍保留；指定重试只处理失败项。刷新后可恢复，重复提交相同输入会复用结果；修改输入需增加该文档 revision。
- 业务材料与制作记录分包。业务包使用自然业务文件名；私有输入、模板版本、ID 映射、实际文件哈希和整数分辅助台账保存在制作记录包。
- 新增 Python 下载收集器，核对实际文件、ZIP 路径、Office 宏与外链、大小、哈希及 origin，保留 raw/candidate 原字节并生成回收清单。

工作台保存当前批次。各轮历史材料由 Forge 回收目录归档；返修前先导出并回收上一轮，避免只依赖浏览器保存旧版本。

## Reference 节点怎么调用

详细字段和调用顺序见 `online/public/BATCH_API.md`，机器可读结构见 `online/public/reference-workbench-v1.schema.json`。这是 `material-batch/1` 的实际实现，之前方案中的 v2 proposal 不是导入格式。

`plan_reference`：按原规约冻结 facts、jobs 和授权。producer 可为 finance、rights、contracts、certificates 或原有 native；只把工作台具备的材料类型送入批次。多个格式共用 document_id，多页不会增加独立文档数。native 作业仍走原有生成方式。

`preflight_workbench`：从任务允许的工作台地址进入 `batch/`，读取当前能力及模板，只探测本轮所需功能。用获准的小批次实际制作、下载并回收，核对实际 origin 和文件哈希。WebMCP 工具名的 UUID 后缀每次发现，不写死在 Pipeline 中。

`produce_reference`：将 jobs 的 producer 映射到 engine，将冻结底稿转换为对应模块完整 payload。调用 validate、stage，再以 include_input=true 读回并对照 plan。逐份生成完成后分别下载 candidate/authoring 两个包，回收到 Worker 工作区。

```sh
python3 tools/collect_workbench.py \
  --business-package /absolute/path/business.zip \
  --authoring-package /absolute/path/authoring.zip \
  --expected-origin https://www.defiuris.com \
  --output /absolute/path/workspace/output/workbench_import
```

收集器的清单提供真实 raw_path、候选路径、download_sha256、producer、模板版本和输入摘要。Agent 据此按当前资源包规约填写 `output/receipts/<job_id>.json`，将通过检查的候选原字节纳入 `output/candidate/`，再整理 `reference_bundle.json`。收集器不替代这些正式接口对象。业务文件不能混入私有制作记录。

`inspect_reference` / `check_reference`：继续独立读取实际文件，核对正文、隐藏内容、证据定位及按需版面检查。工作台返回 succeeded 表示制件已保存；export 返回 download_requested；收集器返回 RECOVERED。这三个状态都不代表 QC PASS。

`repair_reference` / Reference revision：只重做获准修改的文档，增加该文档 revision，保留其他文件的原字节和检查绑定。新的回收目录另存版本，随后交原有独立复检节点。

可将上述相应段落补充到最新 YAML 对应节点的 task 中。原 YAML、资源包版本和 gate 没有在本轮被改写；这份说明供后端联调时采用。

## 接入边界

合同的完整正文由 Agent 或专家提供，工作台负责既有模板填充及 DOCX 制件。需要合同 PDF 时，由管线对已核对的 DOCX 转换，记录源文件哈希。当前不把自由业务背景自动变成完整合同。

工作台整数分台账是实际输入与排序的辅助记录。业务期望仍取自 Forge 已冻结的 plan；不能用观察到的输出反过来修改 expected。XLSX 已生成真实公式和缓存结果，需要表格引擎复算的任务仍应由管线实际执行复算。

当前目录未附带 `legal-reference-workspace-bundle@27` 的完整资源文件，尚未在 Forge Worker 内执行该资源包的整轮 gate。线上工作台也尚未发布本次修改。开发地址是本地验收用途，生产仍使用任务允许的工作台地址与网络政策。

## 验收结果

- 原证照与合同回归通过；第一批 11 组回归通过；下载回收器 6 项测试通过；生产构建通过。
- 真实浏览器通过 WebMCP 制作四模块共 30 份文档：27 个 PDF、3 个 DOCX。27 个 PDF 共 35 页，全部可提取文字且页数与记录一致；银行流水 6 页合并为一份。
- 实际下载的两个 ZIP 经收集器核对，回收 30 份业务文档，哈希一致。刷新恢复后哈希保持一致。
- 浏览器故意制造单份输入失败，验证部分成功、指定重试、修正版本后完成；未变文档始终只生成一次，哈希保持一致。
- 自动检查确认同版面的图像 PDF 与文字层 PDF 第一页逐像素一致，并验证流水号、中文和金额可提取。

验收记录只描述真实运行结果，不是正式任务的 QC 报告或专家批准。

## 主要代码

- `online/shared/batch.js`：批次、状态、逐份保存、重试、版本摘要与交付分包。
- `online/shared/adapters.js`：四模块输入和制件适配、能力发现、模板示例。
- `online/shared/agent-tools.js`：WebMCP 工具。
- `online/shared/pdf.js`：PDF 版面和文字层。
- `online/shared/finance-data.js`：财务表格与观察台账。
- `online/batch/`：批次页面。
- `tools/collect_workbench.py`：真实下载回收。
- `tests/phase1.mjs`、`tests/test_collect_workbench.py`：新增回归检查。

修改渲染规则时应增加 `RENDER_VERSION` 和对应模板版本，避免相同输入摘要复用旧引擎产物。发布前由 CI 执行完整测试和构建。
