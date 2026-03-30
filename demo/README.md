# AI Chat Automation Workbench

本地自动化工作台，用于批量向免费 AI 聊天网页（ChatGPT、Gemini、DeepSeek、Kimi 等）提交问题并收集回复。

## 功能

- **批量问题队列** — 提前编写一系列问题，工作台按顺序自动处理
- **Playwright 浏览器自动化** — 自动打开网页、输入问题、等待并采集 AI 回复
- **额度监测** — 检测免费聊天额度是否用完
- **多账号轮换** — 额度用完后自动切换到其他账号或其他大模型
- **实时状态** — SSE 事件流驱动的 React 仪表盘

## 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 桌面壳 | Tauri 2 (Rust) | 桌面应用包装 |
| 前端 | React 19 + Vite 8 + TypeScript | 操作仪表盘 |
| 后端 | Node.js + TypeScript | HTTP/SSE 服务 + 任务调度 |
| 浏览器自动化 | Playwright | 持久会话 + 多 profile 轮换 |

## 项目结构

```
demo/
├── src/                          # Node.js 后端
│   ├── types.ts                  # 共享类型定义
│   ├── providers.ts              # 各大模型网页选择器配置
│   ├── taskQueue.ts              # 任务队列管理
│   ├── accountManager.ts         # 账号管理与额度轮换
│   ├── chatAutomation.ts         # Playwright 聊天自动化引擎
│   ├── workbench.ts              # 主编排器
│   ├── server.ts                 # HTTP + SSE 服务器 (端口 3220)
│   └── *.test.ts                 # 单元测试 (27 个)
├── ui/                           # React/Vite 前端
│   ├── src/
│   │   ├── pages/                # Dashboard, TaskEditor, AccountManager, Results
│   │   ├── api/                  # REST client + SSE
│   │   ├── hooks/                # useWorkbench (状态管理)
│   │   └── components/           # Layout 组件
│   └── src-tauri/                # Tauri 桌面配置
├── questions.example.json        # 示例问题文件
└── README.md
```

## 快速开始

### 1. 安装依赖

```bash
# 后端
cd demo
npm install

# 前端
cd ui
npm install
```

### 2. 安装 Playwright 浏览器

```bash
npx playwright install chromium
```

### 3. 启动后端服务

```bash
cd demo
npm run dev
# 服务运行在 http://localhost:3220
```

### 4. 启动前端开发服务器

```bash
cd ui
npm run dev
# 打开 http://localhost:5173
```

### 5. (可选) 以 Tauri 桌面应用运行

```bash
cd demo/ui
npx tauri dev
```

## 使用流程

1. **首次启动** — 系统自动为 ChatGPT、Gemini、DeepSeek、Kimi 各创建一个默认账号（含浏览器 profile 目录）
2. **登录站点** — 在 Accounts 页面点击 "🔑 Login" 为每个 AI 站点完成一次登录，登录状态会自动保存
3. **提问** — 在 Dashboard 页面选择 AI 提供者（ChatGPT / Gemini / …），输入问题，点击 "Start Processing"
4. **查看结果** — 在 Dashboard 任务列表中展开查看 AI 回复

> 💡 登录状态和账号配置会持久保存。下次打开平台可直接到 Dashboard 提问，无需重新登录或配置账号。

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/state` | 获取工作台状态 |
| GET | `/api/events` | SSE 事件流 |
| POST | `/api/tasks` | 添加问题 `{ questions: string[] }` |
| DELETE | `/api/tasks/:id` | 删除任务 |
| POST | `/api/tasks/clear` | 清空所有任务 |
| POST | `/api/accounts` | 添加账号 `{ provider, label, profileDir }` |
| DELETE | `/api/accounts/:id` | 删除账号 |
| POST | `/api/accounts/reset-quotas` | 重置所有额度 |
| POST | `/api/start` | 开始处理 |
| POST | `/api/stop` | 停止处理 |
| GET | `/api/providers` | 获取提供者选择器配置 |

## 运行测试

```bash
cd demo
npm test
```

## 支持的 AI 聊天提供者

| 提供者 | 网址 | 说明 |
|--------|------|------|
| ChatGPT | chatgpt.com | OpenAI 免费额度 |
| Gemini | gemini.google.com | Google AI 免费额度 |
| DeepSeek | chat.deepseek.com | DeepSeek 免费额度 |
| Kimi | kimi.moonshot.cn | Moonshot AI 免费额度 |

> **注意**: 各网站的 DOM 选择器会随网站更新而变化。如遇到选择器失效，请在 `src/providers.ts` 中更新对应的选择器。
