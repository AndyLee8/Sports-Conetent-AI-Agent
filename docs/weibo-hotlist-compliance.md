# 微博热榜合规接入

本项目不绕过微博登录、验证码或访问控制，也不在服务器保存个人 Cookie。公开部署时，稳定的微博热榜数据只应来自以下来源：

1. 微博开放平台审核通过的 OAuth/商业数据 API 或订阅服务。
2. 已取得授权、合同和数据使用范围说明的第三方数据供应商。
3. 项目内备用数据。

项目也包含一个基于微博公开 Web JSON 响应的实验性适配器。该适配器无需 Cookie，但不是微博开放平台承诺的正式 API；它仅用于作品集验证，会执行体育内容阈值校验，并在接口失效或返回全站内容时自动降级。正式商业部署前仍需确认微博服务条款和数据展示权限。

微博官方文档说明：普通微博 API 需要 OAuth 授权；商业数据 API 提供搜索数据和订阅服务，部分接口收费。参考：

- <https://open.weibo.com/wiki/微博API>
- <https://open.weibo.com/wiki/商业数据API>
- <https://open.weibo.com/wiki/订阅服务手册>

## 接入配置

在服务端环境变量中配置：

```env
WEIBO_HOTLIST_API_URL=https://your-authorized-provider.example/api/sports-hotlist
WEIBO_HOTLIST_API_TOKEN=server-side-token
```

接口可以返回 JSON 或包含微博热榜表格的 HTML。JSON 支持以下形式：

```json
{
  "topics": [
    {
      "rank": 1,
      "topic": "某体育热点",
      "heat": "120万",
      "change": "↑2",
      "url": "https://example.com/authorized-source",
      "source": "已签约数据供应商",
      "summary": "可选的事实摘要"
    }
  ]
}
```

也可以直接返回数组。若返回 HTML，服务端会使用文章中的表格选择器完成解析。服务端只向该 HTTPS 地址发送 Bearer Token，令牌不会发送到浏览器，也不会交给 DeepSeek。

未配置或授权服务暂时不可用时，页面会明确显示“备用数据”，不会伪装成实时热榜。正式上线前应确认供应商合同覆盖：体育热榜字段、缓存时长、展示范围、再分发权限和删除/纠错机制。

## GitHub 流程审查

参考项目：<https://github.com/legeling/weibo_hotSearch>。

该项目的核心流程是请求 `https://weibo.com/ajax/side/hotSearch`，读取 `data.realtime`，再映射 `word`、`num/raw_hot` 和 `label_name`。当前公开接口在标准浏览器请求头下仍可能返回全站 JSON，但 `cate=sport` 不保证返回独立体育榜单。因此本项目只做了有限的公开接口适配：

- 不使用 Cookie、验证码绕过或隐藏接口。
- 只有体育关键词数量达到最低阈值，才标记为微博体育筛选结果。
- 接口返回全站热搜或体育内容不足时，自动切换到公开体育资讯聚合。
- 页面会显示实际数据来源，不把全站热搜或 RSS 结果伪装成微博体育热榜。

博客文章还提供了 HTML 解析规则：`#pl_top_realtimehot`、`.td-01`、`.td-02 a`、`.td-02 span` 和标题内的 `i` 标签。本项目已将这部分做成纯函数 `parseWeiboSportsHtml`，可供拥有再分发权限的供应商 HTML 使用；它不负责发请求，也不读取 Cookie。

文章中要求复制个人 Cookie、配置代理并以此应对 403。该做法不适合作为公开网页的后台方案，因此没有接入生产抓取链路。

## 本地 Chrome 会话验证

开发环境可以设置 `WEIBO_BROWSER_COOKIES=chrome` 和 `WEIBO_COOKIE_PYTHON_PATH`。服务端会通过 `yt-dlp` 的浏览器 Cookie 读取能力，在进程内访问体育热榜页面并交给 `parseWeiboSportsHtml`：

- Cookie 不写入文件、不打印、不发送给 DeepSeek。
- 页面跳转到访客系统、要求验证或缺少热榜表格时立即失败并降级。
- 该模式依赖运行服务器的机器上存在已登录 Chrome，只适合本地开发或受控内部环境。
- 云端公开部署不会拥有开发者的 Chrome，因此最终上线仍需授权供应商接口。
