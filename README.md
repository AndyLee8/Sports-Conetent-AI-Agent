# 爆款写手

体育内容 AI Agent：从网页、抖音或 B 站链接提取材料，生成深度专栏、短视频口播或社交媒体短文，并执行体育事实核查。项目同时提供体育热点列表、视频语音转写和 Markdown、Word、Excel 导出。

## 先了解部署边界

本项目不是静态网页，不能只使用 GitHub Pages。它需要 Node.js、Python、`ffmpeg`、`yt-dlp` 和 Whisper，因此推荐使用 Docker 部署到 Railway 或其他支持 Docker 的云服务器。

项目支持两种使用模式：

| 模式 | DeepSeek Key | 微博 Cookie | 适合场景 |
| --- | --- | --- | --- |
| 公网网站 | 每位访客在页面输入自己的 Key | 不需要访客 Cookie，自动使用公开/授权/备用数据源 | 作品集和普通访客 |
| 本地或自托管 | 每位使用者在页面输入自己的 Key | 可读取运行项目的这台电脑的 Chrome 登录会话 | 需要个人微博登录状态的开发者 |

网页不会读取访客电脑的 Chrome Cookie。不要要求访客把微博 Cookie 粘贴到公共网站；Cookie 是登录凭证，泄露后可能导致账号风险。正式云端如需稳定微博体育热榜，应配置拥有再分发权限的数据供应商。

## 功能流程

```text
输入来源 → 提取正文/标题/简介 → 视频语音转写（需要时）
        → 有限公开检索 → DeepSeek 生成 → 体育事实核查 → 页面复制或导出
```

## 本地运行

### 1. 安装环境

需要 Node.js 22、pnpm、Python 3.10 或更高版本，以及 `ffmpeg`。

macOS 可以使用 Homebrew：

```bash
brew install node@22 python ffmpeg
corepack enable
```

Windows 或 Linux 请分别安装对应版本的 Node.js、Python、pnpm 和 ffmpeg，并确认以下命令可用：

```bash
node --version
pnpm --version
python3 --version
ffmpeg -version
```

### 2. 安装项目依赖

在项目根目录运行：

```bash
pnpm install
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Windows PowerShell 的虚拟环境路径是 `.venv\\Scripts\\python.exe`，请将下面环境变量中的 Python 路径改成该路径。

### 3. 创建本地配置

复制 `.env.example` 为 `.env.local`。DeepSeek Key 不需要写进文件，启动网页后从右上角“设置 API Key”输入，刷新页面会清除。

本地使用 Chrome 登录微博体育热榜时，在 `.env.local` 中加入：

```env
WEIBO_BROWSER_COOKIES=chrome
WEIBO_COOKIE_PYTHON_PATH=.venv/bin/python
```

然后运行：

```bash
pnpm dev
```

打开 <http://localhost:3000>，输入自己的 DeepSeek API Key，即可生成内容。抖音或 B 站下载失败时，可以在页面上传视频或音频，让 Whisper 识别语音。

## 上传到 GitHub

`.gitignore` 已排除 `.env.local`、虚拟环境、Whisper 缓存和日志。上传前必须确认没有把 API Key 或 Cookie 文件放进仓库。

```bash
git status --short
git add .
git commit -m "prepare production deployment"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

在 GitHub 网页创建仓库时请选择空仓库，不要自动添加 README、`.gitignore` 或 License，否则第一次推送可能产生无关冲突。将上面的 URL 换成你自己的仓库地址。

检查仓库时，以下内容绝不能出现：

- `sk-` 开头的真实 DeepSeek Key
- 微博或抖音 Cookie 字符串
- `cookies.txt`、`.env.local` 或浏览器配置目录

## 使用 Railway 部署公网版本

### 1. 创建项目

1. 登录 <https://railway.app>。
2. 选择 `New Project` → `Deploy from GitHub Repo`。
3. 授权 GitHub，选择刚才的仓库。
4. Railway 会自动识别根目录的 `Dockerfile` 和 `railway.toml`。

### 2. 配置变量

在 Railway 项目的 `Variables` 中加入这些安全默认值：

```env
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
WHISPER_PYTHON_PATH=/opt/venv/bin/python
WHISPER_MODEL=base
WHISPER_CACHE_DIR=/app/.whisper-cache
YT_DLP_PATH=/opt/venv/bin/yt-dlp
```

不要在公共仓库中写入真实 Key。当前设计由每位访客在页面输入自己的 DeepSeek Key，因此 Railway 不需要 `DEEPSEEK_API_KEY`。

云端不要设置以下本机配置：

```env
WEIBO_BROWSER_COOKIES=chrome
WEIBO_COOKIE_PYTHON_PATH=.venv/bin/python
```

Railway 没有你的 Chrome 登录状态。若有合法的微博数据供应商，再设置：

```env
WEIBO_HOTLIST_API_URL=https://your-authorized-provider.example/api/sports-hotlist
WEIBO_HOTLIST_API_TOKEN=server-side-token
```

Token 只在服务器端使用，不会发送给浏览器或 DeepSeek。

### 3. 配置 Whisper 缓存（可选）

在 Railway 的 `Volumes` 添加持久化卷，挂载路径填写：

```text
/app/.whisper-cache
```

这样 Whisper 模型不必每次重新下载。首次构建和首次转写会消耗较多内存，建议使用至少 2 GB RAM 的实例；如果实例资源不足，可以暂时关闭自动视频下载，改用页面上传音频或视频。

### 4. 生成公网地址

部署完成后：

1. 打开 Railway 服务的 `Settings`。
2. 在 `Networking` 中选择 `Generate Domain`。
3. 打开生成的 `*.up.railway.app` 地址。
4. 访问 `/api/health`，看到 `"status":"ok"` 表示应用进程正常。

## 公网部署后的实际行为

| 功能 | 公网状态 |
| --- | --- |
| 输入网页链接并生成 | 支持，访客需要自己的 DeepSeek Key |
| 生成三种内容风格 | 支持，一次生成一种风格 |
| 体育事实核查 | 支持，由 DeepSeek 执行二次核查 |
| 微博热点 | 自动尝试授权供应商、公开接口、公开体育资讯和演示备用源，并标注来源 |
| 访客提供微博 Cookie | 不支持，也不建议收集 |
| 抖音/B站直接下载 | 取决于平台访问和服务器资源；失败时可上传视频/音频识别 |
| Markdown、Word、Excel 导出 | 支持，导出在浏览器本地完成 |

## 常见问题

### 页面能打开，但生成时报 API 错误

点击右上角“设置 API Key”，输入有效的 DeepSeek Key。Key 只在当前页面会话中使用，刷新后需要重新输入。

### 热榜不是微博体育热榜

检查页面显示的数据来源。如果没有配置授权供应商，云端会按合规顺序自动降级，页面会标注“体育资讯热点”或“备用数据”，不会伪装成实时微博体育热榜。

### 抖音链接无法自动识别

点击“识别链接语音”。如果服务器无法下载音轨，下载视频后使用“上传视频/音频”。这通常是平台登录验证或云端没有可用 Cookie 导致的，并非 DeepSeek 生成问题。

### GitHub 推送时提示远程仓库已有内容

重新创建一个空仓库，或先备份远程内容后再合并。不要使用 `git reset --hard` 覆盖本地项目。

## 合规说明

项目不绕过微博登录、验证码或访问控制，也不把个人 Cookie 写入服务器日志。微博热榜正式商用前，应使用官方授权、商业数据服务或拥有再分发权限的供应商，并遵守来源网站的服务条款。
