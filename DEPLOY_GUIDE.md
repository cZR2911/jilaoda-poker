# 部署指南：如何发布游戏

## 选项 1：GitHub Pages（推荐 - 长期稳定，完全免费）

**用 GitHub 建仓确实更好！**
- **优点**：更专业，代码有备份（不怕误删），更新方便，而且**完全免费**。
- **费用**：**0 元**。GitHub 对于公开项目和个人项目都是免费的。

### 步骤：
1. **准备本地仓库**（我已经帮你做好了）：
   - 我已经在你的文件夹里执行了 `git init` 并提交了代码。

2. **创建 GitHub 仓库**：
   - 登录 [GitHub](https://github.com)。
   - 点击右上角的 "+" -> "New repository"。
   - Repository name 填一个名字（比如 `jilaoda-poker`）。
   - **Public**（公开）和 **Private**（私有）都可以（推荐 Public，设置 Pages 更方便）。
   - 点击 "Create repository"。

3. **上传代码**：
   - 在创建好的页面上，找到 "...or push an existing repository from the command line" 这一栏。
   - 复制那三行代码（通常是 `git remote add...`, `git branch...`, `git push...`）。
   - 在 Trae 的终端里粘贴并运行这三行代码。

4. **开启 Pages**：
   - 上传成功后，点击仓库上方的 **Settings**。
   - 在左侧菜单找到 **Pages**。
   - 在 "Build and deployment" 下的 **Branch**，选择 `main` (或 `master`)，文件夹选 `/ (root)`。
   - 点击 **Save**。
   - 等待 1-2 分钟，刷新页面，你会看到顶部出现一个链接（比如 `https://yourname.github.io/jilaoda-poker/`）。
   - **把这个链接发给朋友，就可以手机畅玩了！**

---

## 选项 2：Netlify Drop（最简单 - 拖拽即用）

如果你不想注册 GitHub 账号，或者觉得上面的步骤太麻烦，用这个方法最快。

1. **准备文件夹**
   - 找到你电脑上这个游戏的文件夹：`c:\Users\mlian\Documents\trae_projects\ai pocker`

2. 确保文件夹里有以下文件：
   - `index.html` (这是入口)
   - `style.css`
   - `game.js`
   - 以及所有的图片文件 (`ai1-3.jpg`, `cf1-4.jpg`, `nb1-4.jpg`, `xwy.jpg` 等)

## 步骤 2：上传到 Netlify
1. 打开浏览器，访问：[https://app.netlify.com/drop](https://app.netlify.com/drop)
2. 你会看到一个虚线框，写着 "Drag and drop your site folder here"。
3. 将你的 `ai pocker` **整个文件夹** 直接拖进去。
4. 等待几秒钟，上传完成后，页面状态会变成 "Published"。

## 步骤 3：获取链接
1. 上传成功后，页面上方会显示一个绿色的链接，通常是像 `https://random-name-123456.netlify.app` 这样的地址。
2. 点击这个链接，你的游戏就在互联网上运行了！
3. 把这个链接发给任何人（微信、QQ），他们用手机点开就能玩。
4. **此时你可以关掉你的电脑，游戏依然可以在线访问。**

## 进阶提示（可选）
- **修改链接名字**：点击 "Site settings" -> "Change site name"，可以把乱码改成比如 `jilaoda-poker.netlify.app`，这样更好记。
- **更新游戏**：如果你以后改了代码或加了图片，只需要重新重复步骤 2，再次拖拽文件夹覆盖即可。

祝你在朋友圈大杀四方！😎
