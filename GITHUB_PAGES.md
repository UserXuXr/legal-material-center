# 部署到 GitHub Pages

四个工作台可作为静态网站运行，不需要另租服务器、配置数据库或填写模型 API Key。本项目已包含 `.github/workflows/pages.yml`：推送 `main` 后安装依赖、验证合同功能、构建并发布 `dist/client`。首页、工作台入口和返回链接自动适配仓库路径。

## 第一次发布：GitHub Desktop

1. 安装 [GitHub Desktop](https://desktop.github.com/download/)，登录你的 GitHub 账号。
2. 本次已准备独立的本地 Git 仓库：`recovered/github-pages/legal-material-center`。在 Desktop 中选 **File → Add Local Repository**，选择该文件夹，再点 **Add Repository**。不要选择恢复用的原目录，它仍保留旧 Sites 的远程仓库。
3. 在 Changes 页的 Summary 填 `Initial workbench release`，点击 **Commit to main**。然后点 **Publish repository**。仓库名可用 `legal-material-center`；个人账号发布时 Organization 选 None。
4. 若用 GitHub Free 的免费 Pages，使用 Public 仓库，即取消 **Keep this code private**。这会公开源码和内置示例。私有仓库的 Pages 支持取决于账号方案；网站自身没有登录权限系统。
5. 在 GitHub 网页打开刚发布的仓库，进入 **Settings → Pages**，在 **Build and deployment → Source** 选择 **GitHub Actions**。
6. 进入 **Actions → Deploy workbenches to GitHub Pages → Run workflow**，分支选 `main`，点击运行。首次上传可能先触发一次失败的构建，通常是 Pages 尚未启用；完成第 5 步后重新运行即可。
7. 等 build、deploy 都显示绿色，在 **Settings → Pages → Visit site** 打开网站。默认地址形如 `https://你的账号.github.io/legal-material-center/`，合同页在其后加 `contracts/`。以 GitHub 实际显示的地址为准。

独立部署目录已初始化 Git，但尚未提交、绑定远程或发布。ZIP 包不含 `.git`：若使用 ZIP 解压副本，先在其目录运行 `git init -b main`，再按上述步骤加入 Desktop。不要把 ZIP 本身作为网站上传；仓库根目录应直接包含 `package.json`、`online/` 和 `.github/workflows/pages.yml`。

## 数据迁移与日常更新

- 本机与 GitHub 网站属于不同站点，浏览器草稿不会自动迁移。合同工作台先点“备份工作台”，部署后在新网址点“导入”；其他工作台分别导出、导入方案。
- 用户上传的模板和填写内容保存在各自浏览器，不会成为 GitHub 仓库文件，也不会自动共享给其他访客。清理浏览器缓存前导出备份。
- 后续修改独立部署目录里的源码，在 Desktop 中 **Commit to main → Push origin**，工作流会自动重新发布。
- 若继续在原恢复目录开发，先把有改动的源文件同步到独立部署目录，再提交；两个目录不会自动同步。
- 无需修改 GitHub 的 Actions 全局权限，也无需添加个人令牌，发布所需权限已限定在工作流内。

## 构建与验证

使用 Node.js 24。`npm ci` 安装依赖，`npm run build` 构建，默认根路径 `/`。本地模拟项目站点：

```sh
VITE_BASE_PATH=/legal-material-center/ npm run build
VITE_BASE_PATH=/legal-material-center/ npx vite preview --host 127.0.0.1 --port 3017
```

发布工作流通过 `actions/configure-pages` 获取真实 `base_path`，不把仓库名写死。修改仓库名或自定义域名后重新运行工作流。子页面有独立 `index.html`，可以直接打开和刷新。

本地已验证：子路径构建成功，首页与四个工作台正常加载，全部返回链接指向正确首页，浏览器没有捕获到错误，合同测试通过。真正的 GitHub 运行结果需发布后在 Actions 中查看。

官方说明：[添加本地仓库](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-a-repository-from-your-local-computer-to-github-desktop)、[发布已有项目](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-an-existing-project-to-github-using-github-desktop)、[选择 Pages 发布源](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)、[Pages 支持范围](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)、[Vite 部署说明](https://vite.dev/guide/static-deploy)。
