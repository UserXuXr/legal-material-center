# 在线素材中心

一个静态站点承载五个页面：

- `/`：统一入口
- `/certificates/`：企业证照
- `/finance/`：财务材料
- `/rights/`：权属登记
- `/contracts/`：合同制作（资产收购、客户承接、保密协议）

站点访问范围由 Sites 当前权限设置决定。在线使用不依赖本机服务。草稿保存在访问者当前浏览器的站点存储中，不会自动从本机网址迁移，也不会跨设备同步。需要迁移时，在原工作台导出填写方案，再到在线工作台导入。

## 维护

`online/` 是经过检查的发布快照。财务与权属模块源自相邻目录，入口分别位于 `online/modules/finance` 和 `online/modules/rights`；调整在线版不会直接修改原工作台。`snapshot.json` 记录快照文件摘要。后续新增模块时，新增独立页面并在 `online/workbenches.json` 登记卡片，同时添加 Vite 页面入口。

证照模块与另外两个工作台采用相同的浏览器端结构：React 编辑界面、独立字段模型、纯函数 SVG 排版、Canvas 图片导出、按需加载的 jsPDF / JSZip。版式匹配通过 ES module 显式导入，不使用全局对象或模拟 API。打开页面和预览不等待字体、图片解码或示例批量生成；只有可检索字段 PDF 在导出时读取本网站的开放许可字体，失败可以重试，其他导出不受影响。

`online/certificates/page.tsx` 是编辑器，`lib/documents.js` 生成文书，`lib/export.js` 导出文件，`lib/storage.js` 管理浏览器草稿和方案。六种证照使用已随站点发布的固定底图，构建和生成文件均不需要 Python。旧版 JSON 方案、未载字段设置和浏览器存储键保持兼容。

`tools/sync-workbenches.mjs` 只更新相邻财务与权属 React 模块的快照，更新后须复核差异并重新测试。证照编辑器在本站直接维护，不再从 Python 工作台复制。

安装依赖：`npm ci`。构建：`npm run build`。验证：`npm test`。本机预览：`npm run dev`，端口 3016。发布目录为 `dist/client`，站点绑定见 `.openai/hosting.json`。字体许可位于 `online/public/fonts/OFL.txt`。

上传内容只有本站源代码、内置演示数据和模板资产，不包含原始测试案例文件或用户已保存方案。`work/` 为本机构建及验证临时文件，不发布。

本机素材中心仍使用 `server.py` 与 `web/` 管理入口。企业证照入口改为 Node 端口 3016 的 `/certificates/`，原“启动证照工作台.command”也打开该编辑器。Python 仅可选用于旧的本机入口管理器，不参与证照生成。

仅银行收付模式支持出资、借款等非开票交易，仅输出银行材料。资料摘录可选择保留未载字段，证照的版式参考日期不会打印为发证日期。
