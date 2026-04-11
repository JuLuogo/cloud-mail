# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

Peroe Mail 是一个基于 Cloudflare 的简约响应式邮箱服务，支持邮件发送、附件收发等功能。可部署到 Cloudflare Workers，降低服务器成本，适合搭建自己的邮箱服务。

## 技术栈

### 后端 (mail-worker)
- **平台**: Cloudflare Workers
- **Web框架**: Hono
- **ORM**: Drizzle
- **邮件发送**: Resend
- **缓存**: Cloudflare KV
- **数据库**: Cloudflare D1
- **文件存储**: Cloudflare R2
- **定时任务**: Cloudflare Workers Cron Triggers

### 前端 (mail-vue)
- **框架**: Vue 3
- **UI库**: Element Plus
- **状态管理**: Pinia + pinia-plugin-persistedstate
- **路由**: Vue Router
- **HTTP客户端**: Axios
- **图表**: ECharts
- **国际化**: Vue I18n
- **构建工具**: Vite

## 项目结构

```
peroe-mail/
├── mail-worker/              # Worker 后端项目
│   ├── src/
│   │   ├── api/             # API 接口层 (包含所有路由定义)
│   │   ├── const/           # 项目常量
│   │   ├── dao/             # 数据访问层 (Drizzle ORM 操作)
│   │   ├── email/           # 邮件处理与接收
│   │   ├── entity/          # 数据库实体定义 (Drizzle schema)
│   │   ├── error/           # 自定义异常
│   │   ├── hono/            # Hono 框架配置、拦截器、全局异常处理
│   │   ├── i18n/            # 语言国际化
│   │   ├── init/            # 数据库初始化
│   │   ├── model/           # 响应体数据封装
│   │   ├── security/        # 身份权限认证 (JWT)
│   │   ├── service/         # 业务服务层
│   │   ├── template/        # 消息模板
│   │   ├── utils/           # 工具类
│   │   └── index.js         # 项目入口文件
│   ├── package.json         # 项目依赖
│   └── wrangler.toml        # Cloudflare Workers 配置
│
├── mail-vue/                # Vue 前端项目
│   ├── src/
│   │   ├── axios/           # Axios 配置
│   │   ├── components/      # 自定义组件
│   │   ├── echarts/         # ECharts 组件导入
│   │   ├── i18n/            # 语言国际化
│   │   ├── init/            # 入站初始化
│   │   ├── layout/          # 主体布局组件
│   │   ├── perm/            # 权限认证
│   │   ├── request/         # API 接口调用
│   │   ├── router/          # 路由配置
│   │   ├── store/           # 全局状态管理 (Pinia)
│   │   ├── utils/           # 工具类
│   │   ├── views/           # 页面组件
│   │   ├── app.vue          # 入口组件
│   │   ├── main.js          # 入口 JS
│   │   └── style.css        # 全局 CSS
│   ├── package.json         # 项目依赖
│   └── env.release          # 项目配置
│
└── .github/
    ├── workflows/
    │   └── deploy-cloudflare.yml  # GitHub Actions 部署配置
    └── ISSUE_TEMPLATE/           # Issue 模板
```

## 常用开发命令

### 后端开发 (mail-worker)
```bash
cd mail-worker

# 安装依赖
pnpm install

# 本地开发 (使用 wrangler-dev.toml 配置)
pnpm dev

# 测试部署 (使用 wrangler-test.toml 配置)
pnpm test

# 生产部署 (使用 wrangler.toml 配置)
pnpm deploy

# 执行单元测试
pnpm vitest run
```

### 前端开发 (mail-vue)
```bash
cd mail-vue

# 安装依赖
pnpm install

# 本地开发 (开发模式)
pnpm dev

# 本地开发 (远程模式)
pnpm remote

# 生产构建
pnpm build

# 预览构建结果
pnpm preview
```

### 完整部署流程

项目使用 GitHub Actions 自动部署 (`.github/workflows/deploy-cloudflare.yml`)，包含以下步骤：
1. 检出代码
2. 安装依赖
3. 配置环境变量
4. 设置 KV 数据库
5. 设置 D1 数据库
6. 部署到 Cloudflare Workers
7. 初始化数据库

## 核心架构

### 1. 后端架构 (Hono + Cloudflare Workers)

**入口文件**: `mail-worker/src/index.js`

主要功能：
- API 请求处理： `/api/*` 路由转发到 Hono 应用
- 静态资源处理： `/static/*` 和 `/attachments/*` 路由处理
- 邮件接收处理： `email()` 函数
- 定时任务： `scheduled()` 函数（每日清理任务）

**API 路由结构**：所有 API 在 `mail-worker/src/api/` 目录下定义，使用 Hono 框架的路由功能。

**数据访问**：通过 Drizzle ORM 操作 D1 数据库，DAO 层在 `dao/` 目录。

### 2. 前端架构 (Vue 3 + Element Plus)

**入口文件**: `mail-vue/src/main.js`

**主要功能**：
- 响应式布局适配 PC 和移动端
- 用户管理、邮件管理、权限管理
- 邮件发送/接收，附件管理
- 数据可视化（ECharts）
- 个性化设置
- 多语言支持

**状态管理**: 使用 Pinia + 本地存储持久化。

## 开发注意事项

### 1. Cloudflare Workers 开发

- 需要安装 Wrangler CLI：`npm install -g wrangler`
- 需要配置 Cloudflare 账户信息
- 本地开发需要模拟 Cloudflare 服务环境

### 2. 数据库操作

- 使用 Drizzle ORM 进行数据库操作
- 数据库结构在 `entity/` 目录中定义
- 本地开发需要配置 D1 数据库绑定

### 3. 环境变量

**后端环境变量** (wrangler.toml)：
```toml
# 必填
domain = ["example.com"]       # 邮件域名
admin = "admin@example.com"    # 管理员邮箱
jwt_secret = "secret"         # JWT 密钥

# 可选
orm_log = false               # 是否输出 SQL 日志
project_link = ""             # 项目链接
linuxdo_switch = ""           # LinuxDo OAuth 开关
```

**前端环境变量** (env.release)：
- API 基础 URL 配置
- 其他环境相关设置

### 4. 国际化

项目支持中英文双语，国际化文件位于：
- 后端：`mail-worker/src/i18n/`
- 前端：`mail-vue/src/i18n/`

## 常用命令和工具

### 代码格式化

项目使用 Prettier 进行代码格式化：

**后端配置** (`mail-worker/.prettierrc`)：
```json
{
  "printWidth": 140,
  "singleQuote": true,
  "semi": true,
  "useTabs": true
}
```

### 单元测试

**后端测试框架**：Vitest + Cloudflare Workers 测试池

配置文件：`mail-worker/vitest.config.js`

测试命令：
```bash
# 运行所有测试
pnpm vitest run

# 运行测试并生成报告
pnpm vitest run --reporter verbose
```

### Git 提交规范

使用 Conventional Commits 规范：
- feat: 新功能
- fix: 修复 bug
- refactor: 代码重构
- docs: 文档更新
- chore: 构建过程或辅助工具的变动

## 部署说明

### 1. 前置条件

- Cloudflare 账户
- 自定义域名（可选）
- 配置好的 D1 数据库
- 配置好的 KV 命名空间
- 配置好的 R2 存储桶（可选）

### 2. 自动部署 (GitHub Actions)

使用 `.github/workflows/deploy-cloudflare.yml` 自动部署：

1. 在 GitHub 仓库设置 Secrets
2. 将代码推送到 main 分支
3. 自动触发部署流程
4. 部署完成后自动初始化数据库

### 3. 手动部署

```bash
cd mail-worker
pnpm install
pnpm wrangler deploy
```

部署后需要手动初始化数据库：
```bash
curl "https://<your-worker-url>/api/init/<jwt_secret>"
```

## 主要功能模块

### 1. 用户管理
- 用户注册/登录
- 管理员用户管理
- 角色与权限管理 (RBAC)
- 注册码管理

### 2. 邮件功能
- 邮件发送 (Resend)
- 邮件接收
- 邮件附件管理 (R2)
- 邮件搜索与过滤
- 邮件星标
- 邮件状态管理

### 3. 管理功能
- 邮件管理
- 用户管理
- 统计分析 (ECharts)
- 系统设置
- Telegram 推送
- 定时任务

### 4. 其他功能
- 人机验证 (Turnstile)
- 个性化设置
- 数据导入/导出
- 开放 API

## 开发流程

### 1. 新增功能

1. 在后端 `api/` 目录添加路由
2. 在 `service/` 目录添加业务逻辑
3. 在 `dao/` 目录添加数据访问
4. 在 `entity/` 目录添加数据库 schema（如果需要）
5. 在前端 `request/` 目录添加 API 调用
6. 在 `views/` 目录添加页面组件
7. 添加路由配置
8. 测试功能
9. 提交代码

### 2. 修复 Bug

1. 定位问题位置
2. 修复代码
3. 编写测试用例
4. 验证修复
5. 提交代码

## 贡献指南

1.  Fork 仓库
2.  创建特性分支
3.  提交更改
4.  推送到分支
5.  打开 Pull Request

## 许可证

本项目采用 MIT 许可证。
