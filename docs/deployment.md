# 部署检查清单

这份清单用于把“爆款写手”从本地项目发布到 GitHub 和公网。推荐顺序是：本地验证 → GitHub → Railway → 公网验收。

## 发布前检查

- [ ] `pnpm install` 能完成
- [ ] `.venv/bin/pip install -r requirements.txt` 能完成
- [ ] `pnpm build` 通过
- [ ] 本地页面可以打开
- [ ] 使用测试 API Key 生成过一次内容
- [ ] `.env.local` 没有被 Git 跟踪
- [ ] `git status --short` 没有 Cookie 文件或媒体文件
- [ ] 生产环境不设置 `WEIBO_BROWSER_COOKIES=chrome`

## GitHub 操作

```bash
git add .
git commit -m "prepare production deployment"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

如果已经配置过远程仓库，不要重复执行 `git remote add origin`，先运行：

```bash
git remote -v
```

## Railway 操作

1. `New Project` → `Deploy from GitHub Repo`。
2. 选择仓库，等待 Docker 构建。
3. 在 `Variables` 加入 `.env.example` 中的云端安全变量。
4. 在 `Settings` → `Networking` → `Generate Domain`。
5. 打开 `/api/health`，确认返回 JSON 且 `status` 为 `ok`。
6. 在网页输入访客自己的 DeepSeek Key，完成一次生成。
7. 测试热点来源标签、网页链接生成、文件上传转写和三种导出。

## 不应配置的变量

```env
WEIBO_BROWSER_COOKIES=chrome
WEIBO_COOKIE_PYTHON_PATH=.venv/bin/python
```

这两个变量只对运行在个人电脑上的本地服务有意义。云服务器没有个人 Chrome 会话。

## 公网验收标准

公网用户无需登录微博，也无需把微博 Cookie 粘贴给网站；输入自己的 DeepSeek Key 后可以生成内容。热点区域必须显示实际数据来源和更新时间。数据源不可用时应显示“体育资讯热点”或“备用数据”，不能继续显示“微博体育热榜 · 实时优先”来制造误解。
