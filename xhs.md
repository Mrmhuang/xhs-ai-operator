xhs-ai-operator/
├── server/                          # Node.js 后端 (Express)
│   ├── app.js                       # 主入口
│   ├── plugin-manager.js            # 可插拔插件管理器
│   ├── plugins/
│   │   ├── url-scraper.js           # 链接抓取（Jina Reader + Defuddle + Cheerio）
│   │   ├── deepseek-writer.js       # DeepSeek 文案生成（流式）
│   │   ├── nano-banana.js           # Nano Banana 图片生成（Gemini API）
│   │   ├── trendradar.js            # TrendRadar 热点数据（MCP 对接）
│   │   └── xhs-publisher.js         # 小红书发布（xiaohongshu-mcp）
│   └── routes/
│       ├── chat.js                  # 对话接口（SSE 流式）
│       ├── image.js                 # 图片生成/上传
│       ├── trending.js              # 热点数据
│       ├── publish.js               # 发布到小红书
│       └── plugins.js               # 插件管理
├── web/                             # React 前端 (Vite + Tailwind)
│   └── src/
│       ├── App.jsx                  # 三栏布局主应用
│       ├── api.js                   # API 封装
│       ├── hooks/useChat.js         # 对话状态管理
│       └── components/
│           ├── TrendingPanel.jsx    # 左栏：AI 热点面板
│           ├── ChatPanel.jsx        # 中栏：对话交互区
│           └── NotePreview.jsx      # 右栏：笔记预览+发布
├── skill/SKILL.md                   # OpenClaw Skill 描述
├── docker-compose.yml               # 一键部署（含 TrendRadar）
├── Dockerfile
└── .env.example

---

## 服务端口一览

| 服务 | 端口 | 说明 |
|------|------|------|
| Vite dev server | :5173 | **开发时访问这个端口**，改前端代码实时热更新 |
| Express 后端 | :3000 | API 服务；也会 serve `web/dist/` 静态文件（生产用） |
| TrendRadar MCP | :3001 | 热点数据源（Docker），40+ 平台爬虫 |
| xiaohongshu-mcp | :18060 | 小红书发布（Docker），cookie 登录 |

---

## 开发启动（推荐）

```bash
cd /Users/huangshijin/Documents/aiProject/xhs-ai-operator

# 第一步：启动外部依赖（Docker 容器）
docker compose up -d    # 启动 trendradar(:3001) + xiaohongshu-mcp(:18060)

# 第二步：启动主项目
npm run dev
# 等价于同时执行：
#   npm run dev:server  → node --watch server/app.js  → 后端 :3000（改 server/ 代码自动重启）
#   npm run dev:web     → cd web && vite dev          → 前端 :5173（改 web/src/ 代码实时热更新）
```

**开发时浏览器访问 http://localhost:5173**
- Vite 会把 `/api`、`/uploads`、`/trend-report` 请求自动代理到后端 :3000
- 改前端代码保存即生效，不需要手动构建

**注意：不要在开发时访问 :3000**
- :3000 的 Express 会优先返回 `web/dist/` 里的旧构建产物
- 如果 `web/dist/` 存在，你在 :3000 看到的永远是上次 `npm run build` 的结果

---

## 生产部署

```bash
# 方式一：全 Docker
docker compose up -d   # 拉起所有服务

# 方式二：手动
npm run build          # 构建前端到 web/dist/
npm start              # NODE_ENV=production node server/app.js
# 此时访问 http://localhost:3000（Express 直接 serve dist/ 静态文件）
```

---

## 环境变量（.env）

```bash
cp .env.example .env
```

| 变量 | 用途 | 必填 |
|------|------|------|
| DEEPSEEK_API_KEY | AI 写作（DeepSeek API） | 是 |
| DEEPSEEK_BASE_URL | DeepSeek API 地址，默认 https://api.deepseek.com | 否 |
| GEMINI_API_KEY | AI 配图（Gemini 2.0 Flash） | 是 |
| TRENDRADAR_MCP_URL | TrendRadar MCP 地址，默认 http://localhost:3001/mcp | 否（不配则走 RSS 回退） |
| XHS_MCP_URL | 小红书 MCP 地址，默认 http://localhost:18060/mcp | 否（不配则无法发布） |
| PORT | 后端端口，默认 3000 | 否 |
| UPLOAD_DIR | 图片上传目录，默认 ./uploads | 否 |

---

## 常用命令

```bash
# 关闭占用端口
lsof -ti :3000 | xargs kill -9 2>/dev/null; echo "done"

# 手动构建前端（仅生产部署需要，开发不需要）
npm run build

# 小红书首次登录（二选一）
# 方式一：Docker 方式，调用 MCP 的 get_login_qrcode 接口扫码
# 方式二：本地二进制
cd xiaohongshu-mcp
chmod +x xiaohongshu-login-darwin-arm64 xiaohongshu-mcp-darwin-arm64
./xiaohongshu-login-darwin-arm64    # 弹浏览器扫码
./xiaohongshu-mcp-darwin-arm64      # 启动 MCP 服务
```

---

## 插件式设计

随时可以引入新的 Skill，只需 3 步：
1. 在 server/plugins/ 下新增 xxx.js
2. 实现标准接口（name, description, 方法）
3. 在 app.js 中 pluginManager.register(xxx) — 前后端自动可用

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                  前端 (React + Vite) :5173                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │TrendingPanel │  │  ChatPanel   │  │   NotePreview      │    │
│  │ (左栏:热点)  │  │ (中栏:对话)  │  │ (右栏:预览+发布)   │    │
│  └──────────────┘  └──────────────┘  └────────────────────┘    │
│                    api.js (SSE/REST)                             │
│             Vite proxy: /api → :3000                            │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTP
┌─────────────────────────────┴───────────────────────────────────┐
│                  后端 (Express) :3000                             │
│                                                                  │
│  5个插件:                                                        │
│  • url-scraper     链接正文抓取 (Jina Reader + Defuddle + Cheerio)           │
│  • deepseek-writer AI写作 (DeepSeek API, 流式SSE)               │
│  • nano-banana     AI配图 (Gemini 2.0 Flash)                    │
│  • trendradar      热点引擎 (MCP客户端 + RSS回退)               │
│  • xhs-publisher   小红书发布 (MCP客户端)                        │
│                                                                  │
│  注意：:3000 同时 serve web/dist/ 静态文件                       │
│  开发时必须访问 :5173，否则看到的是旧构建产物                     │
└────────────┬──────────────────────────┬─────────────────────────┘
             │ MCP (JSON-RPC 2.0)       │ MCP (JSON-RPC 2.0)
    ┌────────┴────────┐        ┌────────┴──────────┐
    │ TrendRadar MCP  │        │ xiaohongshu-mcp   │
    │  :3001 (Docker) │        │  :18060 (Docker)  │
    │ 爬虫→SQLite→MCP │        │ cookie→小红书API  │
    └─────────────────┘        └───────────────────┘
```

---

## 三个 Tab 的数据来源

### 「报告」tab
- 数据来源：TrendRadar 爬虫生成的 HTML 报告文件
- 链路：前端切到报告 tab → `getTrendReport()` → `GET /api/trending/report` → 后端解析 `TrendRadar/output/html/latest/current.html`
- 依赖：**必须有 TrendRadar Docker 容器 + 运行过爬虫**（点"抓取"按钮或定时抓取）
- 爬虫代码来源：[github.com/sansan0/TrendRadar](https://github.com/sansan0/TrendRadar)，Docker 镜像 `ghcr.io/sansan0/trendradar:latest`
- 本地 `TrendRadar/` 目录是仓库源码的副本（仅供参考），**运行时用的是 Docker 镜像里的代码**
- 关键词文件：`trendradar-config/frequency_words.txt`（通过 Docker volume 映射到容器内 `/app/config/frequency_words.txt`）
  - 当前 `trendradar-config/` 是空目录，容器使用镜像内置的默认关键词
  - 如需自定义：将 `TrendRadar/config/` 下的文件复制到 `trendradar-config/` 后修改
- 爬虫配置：`trendradar-config/config.yaml`（平台列表、RSS 源、AI 分析、推送通知等）
- 报告渲染：`TrendRadar/trendradar/report/html.py`

### 「最新」tab
- 数据来源：优先 MCP，回退 RSS
- 链路：前端 `fetchData()` → `getTrending({ limit: 30, keyword: 'AI' })` → `GET /api/trending/latest` → `trendradar.js → getLatestNews()`
- **MCP 路径（TrendRadar Docker 运行时）**：调用 MCP 工具 `get_latest_news` → SQLite 查询 40+ 平台数据
- **RSS 回退路径（Docker 未运行时）**：读取 `server/frequency_words.txt` 全部关键词 → 对每个关键词并发请求 Google News RSS + Bing News RSS → 去重排序
- `keyword='AI'` 是特殊值，表示不做二次过滤，返回全部结果

### 「热门话题」tab
- 数据来源：从最新新闻中统计关键词出现频次
- 链路：前端 → `getTrendingTopics({ limit: 15 })` → `GET /api/trending/topics` → `trendradar.js → getTrendingTopics()`
- MCP 路径：调用 `get_trending_topics` 工具
- 回退路径：先执行一次 `_fallbackGetLatestNews` 抓取，再用 `_extractTopics` 统计关键词命中次数

---

## 关键词文件

有两个关键词文件，作用不同：

| 文件 | 使用场景 | 修改后何时生效 |
|------|----------|----------------|
| `server/frequency_words.txt` | RSS 回退抓取 + 话题统计 | 下次刷新立即生效 |
| `trendradar-config/` (Docker 映射) | TrendRadar 爬虫平台/关键词配置 | 重新运行爬虫后生效 |

---

## 数据流

### 热点抓取
```
用户点击"刷新" → TrendingPanel → GET /api/trending/latest
                                        │
                     trendradar.js 插件 ──┤
                     ├─ [优先] MCP(:3001) → TrendRadar → SQLite(40+平台热榜)
                     ├─ [手动爬虫] execFile("uv run trendradar") → 爬虫跑完→生成HTML报告
                     └─ [回退] MCP不可用 → frequency_words.txt 关键词 → Google/Bing RSS
                                        │
                     返回标准化数据 → 前端渲染新闻列表
```

### 写笔记
```
用户选热点/贴链接 → ChatPanel.sendMessage()
                        │
  POST /api/chat (SSE流式) → url-scraper 抓链接正文
                             → deepseek-writer.chatStream() → DeepSeek API
                             → SSE 逐块推送给前端
                        │
  前端流式渲染 → 流结束后正则提取 JSON {title, content, tags}
              → 自动填充到右栏 NotePreview
```

### 发布到小红书
```
用户点"发布" → NotePreview → POST /api/publish
                                    │
              xhs-publisher.js ─────┤
              MCP(:18060) → xiaohongshu-mcp → 小红书 API
```

---

## 插件编码细节

### url-scraper.js — 链接抓取策略

三层降级架构，按链接类型 + 可用性自动选择：

```
用户贴链接
    │
    ├─ 微信公众号？→ cheerio 专用逻辑（不走 Jina/Defuddle）
    │   • 选择器：#js_content（正文）、#activity-name（标题）
    │   • 过滤广告段落：正则匹配"阅读原文/扫码/咨询群"等
    │   • 图片：从 img[src] 和 img[data-src] 提取，排除 icon/logo/avatar
    │   • 微信专用提取失败时，继续走通用流程
    │
    ├─ 其他链接：
    │   ▼
    │ ┌─────────────────────────────┐
    │ │  策略 1: Jina Reader API    │
    │ │  r.jina.ai/{url}            │
    │ │  • 有无头浏览器，能处理 JS 渲染的 SPA 页面
    │ │  • 直接返回 Markdown，质量最高
    │ │  • 超时 20s（因为有渲染过程）
    │ │  • 有 JINA_API_KEY → 500 RPM；无 → 免费 20 RPM
    │ │  • 成功后额外 fetch HTML 抓图片（Jina 不返回图片列表）
    │ └──────────┬──────────────────┘
    │            │ 失败？console.warn 打印日志，继续降级
    │            ▼
    │ ┌─────────────────────────────┐
    │ │  策略 2: Defuddle 本地提取   │
    │ │  fetch HTML → Defuddle()    │
    │ │  • 替代 Readability，提取质量更高
    │ │  • 支持 Markdown 输出
    │ │  • 超时 15s
    │ │  • 零外部 API 依赖，纯本地解析
    │ └─────────────────────────────┘
    │
    ▼
  返回完整内容（不做截断）
```

**降级日志**：Jina 失败（如没额度 429、超时等）会打 `console.warn`：
```
[url-scraper] Jina Reader failed for https://...: Jina Reader returned 429
```
不影响用户侧体验，自动降级到 Defuddle。两层都失败时返回 `{ success: false, error: "Both Jina and Defuddle failed: ..." }`。

**图片提取**：统一逻辑，从 HTML 中用 cheerio 提取 `<img>` 的 src/data-src，去重后最多取 10 张，排除 icon/logo/avatar。

---

### deepseek-writer.js — AI 写作三步流水线

```
素材原文
    │
    ▼
┌─────────────────────────────────────────────────┐
│  Step 1: 事实提炼 (FACT_EXTRACT)                │
│  • system: XHS_FACT_EXTRACT_SYSTEM_PROMPT       │
│  • temperature: 0.2（低温确保严谨）              │
│  • max_tokens: 2000                             │
│  • response_format: json_object                 │
│  • 输出：sourceFacts JSON（sourceType/mustMention│
│    Facts/secondaryFacts/writingFocus 等）         │
│  • 失败时 sourceFacts=null，不阻断流程           │
└──────────────────┬──────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│  Step 2: 写稿 (NOTE_SYSTEM)                     │
│  • system: XHS_NOTE_SYSTEM_PROMPT               │
│    └─ 包含 XHS_CORE_PROMPT（人设+风格+反AI模式） │
│  • user: raw_materials + source_facts + 指令     │
│  • temperature: 0.55（适度创意）                  │
│  • max_tokens: 4096                             │
│  • response_format: json_object                 │
│  • 输出：{title, content, tags, imagePrompt}    │
└──────────────────┬──────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│  Step 3: 审校 (NOTE_REVIEW)                     │
│  • system: XHS_NOTE_REVIEW_SYSTEM_PROMPT        │
│  • user: raw_materials + source_facts + 初稿     │
│    └─ 同时传入原始素材，做"素材 ↔ 成稿"直接对比  │
│  • temperature: 0.2（严格审校）                   │
│  • max_tokens: 4096                             │
│  • 审校清单：事实核验→去废话→节奏语感→术语→结尾   │
│  • 失败时退回 Step 2 初稿，不会完全挂掉          │
└─────────────────────────────────────────────────┘
```

**Prompt 结构**：
```
XHS_CORE_PROMPT（基础人设 + 风格规范，所有写作任务共享）
    ├── XHS_NOTE_SYSTEM_PROMPT      = CORE + 写稿任务指令 + 输出格式
    ├── XHS_POLISH_SYSTEM_PROMPT    = CORE + 润色任务指令
    └── XHS_CHAT_SYSTEM_PROMPT      = CORE + 自由对话指令
XHS_FACT_EXTRACT_SYSTEM_PROMPT      独立 prompt，事实提炼（不含 CORE）
XHS_NOTE_REVIEW_SYSTEM_PROMPT       独立 prompt，审校编辑（不含 CORE）
```

**其他写作模式**：
- `polishNote(currentNote, instruction)`：润色/改写，单步调用，temperature 0.5
- `chat(messages)` / `chatStream(messages)`：自由对话，temperature 0.8，不输出 JSON

---

## 容量限制与瓶颈

| 层 | 限制 | 说明 |
|---|---|---|
| 前端输入框 | 无 maxLength | textarea 没设最大字符数，高度自动撑开（最高 120px，体验上长文显示区域偏小） |
| API 请求体 | 50MB | `express.json({ limit: '50mb' })`，纯文本远够用 |
| 后端路由 | 无截断 | `generate-note` 接口把 materials 原样传给 `generateNote()`，不做截断 |
| DeepSeek API | **64K tokens** | DeepSeek-Chat 上下文窗口，这是实际瓶颈 |

**素材长度估算**（Step 3 最吃 token，因为同时包含素材+事实清单+初稿）：
- **≤ 1 万字**（~15K tokens）：三步都不超限，完全没问题
- **1-2 万字**（15K-30K tokens）：前两步 OK，Step 3 可能紧张
- **> 2 万字**：Step 3 大概率超限报错，代码有 try-catch 兜底，退回 Step 2 初稿

---

## 错误处理机制

整体设计原则：**逐级降级，不让用户看到报错**。

| 场景 | 处理方式 |
|---|---|
| Jina Reader 失败（没额度/超时/服务异常） | `console.warn` 打印日志，自动降级到 Defuddle 本地提取 |
| Defuddle 也失败 | 返回 `{ success: false, error }` 给前端 |
| Step 1 事实提炼失败 | `sourceFacts = null`，Step 2 照常写稿（少了事实约束） |
| Step 2 写稿 JSON 解析失败 | 把原始文本当 content 返回 |
| Step 3 审校失败（超限/解析错） | 退回使用 Step 2 初稿 |
| 微信专用提取失败 | 继续走通用 Jina → Defuddle 流程 |