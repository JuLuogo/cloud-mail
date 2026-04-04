# Cloud Mail GitHub Actions 部署环境变量

## 🚀 部署流程概述

Cloud Mail 使用 GitHub Actions 自动化部署到 Cloudflare Workers。以下是部署过程中直接使用的环境变量列表。

## 📋 完整变量列表

### 🔧 必填变量

这些变量是部署过程必需的，必须在 GitHub Secrets 中配置。

| 变量名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| **CLOUDFLARE_ACCOUNT_ID** | String | Cloudflare 账户 ID | `f123456789abcdef0123456789abcdef` |
| **CLOUDFLARE_API_TOKEN** | String | Cloudflare API 令牌（需要 Workers 部署权限） | `ABC123XYZ789...` |
| **ADMIN** | String | 超级管理员邮箱地址 | `admin@example.com` |
| **DOMAIN** | JSON array | 支持的邮箱域名列表 | `["example.com", "test.org"]` |
| **JWT_SECRET** | String | JWT 令牌密钥（不含特殊字符） | `b7f29a1d-18e2-4d3b-941f-f6b2c97c02fd` |

### 📊 资源绑定变量（可选，但推荐）

这些变量用于绑定 Cloudflare 资源，未配置时会自动创建。

| 变量名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| **D1_DATABASE_ID** | String | D1 数据库 ID（可选，未配置会自动创建） | `38d668a0-b14a-4e9e-8e32-54e8f6a2c4d1` |
| **KV_NAMESPACE_ID** | String | KV 命名空间 ID（可选，未配置会自动创建） | `2io01d4b299e481b9de060ece9e7785c` |
| **R2_BUCKET_NAME** | String | R2 存储桶名称（可选，未配置会禁用附件功能） | `email-attachments` |

### 🌐 自定义域名配置（可选）

| 变量名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| **CUSTOM_DOMAIN** | String | 自定义域名（可选，用于绑定 Workers 路由） | `mail.example.com` |

### 🔗 项目信息（可选）

| 变量名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| **NAME** | String | 项目名称（默认：cloud-mail） | `my-mail-service` |
| **PROJECT_LINK** | String | 项目链接（用于页面底部） | `https://github.com/maillab/cloud-mail` |

### 🔐 OAuth 配置（可选）

用于配置 LinuxDo OAuth 登录（需在系统设置中启用）。

| 变量名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| **LINUXDO_CLIENT_ID** | String | LinuxDo OAuth Client ID | `abc123def456` |
| **LINUXDO_CLIENT_SECRET** | String | LinuxDo OAuth Client Secret | `ghij789klm012` |
| **LINUXDO_CALLBACK_URL** | String | LinuxDo OAuth 回调 URL | `https://your-domain.com/api/oauth/callback` |
| **LINUXDO_SWITCH** | String | 是否启用 LinuxDo OAuth（true/false） | `true` |
| **SES_ACCESS_KEY** | String | AWS SES 访问密钥（Access Key ID） | `AKIA1234567890ABCDEF` |
| **SES_SECRET_KEY** | String | AWS SES 秘密密钥（Secret Access Key） | `wxyz7890abcdef1234567890ghijklmnop` |
| **SES_REGION** | String | AWS SES 区域 | `us-east-1` |
| **SES_ENABLED** | String | 是否启用 SES 邮件发送（true/false） | `true` |

## 🛠️ 配置位置

这些变量需要在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中配置。

### 🔒 GitHub Secrets

用于存储敏感信息，配置后会加密存储：
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `JWT_SECRET`
- `ADMIN`
- `DOMAIN`
- 其他敏感信息

### 📝 GitHub Variables

用于存储非敏感信息，可在工作流中直接访问：
- `NAME`
- `CUSTOM_DOMAIN`
- `PROJECT_LINK`
- 其他非敏感配置

## 🚀 部署流程

当代码推送到 main 分支时，会自动触发部署流程，包括：

1. 检出代码
2. 安装依赖
3. 设置环境
4. 配置资源（KV、D1）
5. 部署到 Workers
6. 初始化数据库

## 🔍 验证变量

部署过程会验证关键变量：

- **JWT_SECRET**：检查是否为空或包含无效字符（?%#/\\）
- **DOMAIN**：验证是否为有效的 JSON 数组格式
- **ADMIN**：检查是否为空
- **CLOUDFLARE_ACCOUNT_ID**：检查是否为空
- **CLOUDFLARE_API_TOKEN**：检查是否为空

## 📚 获取帮助

如需获取这些变量的具体值，请参考：

### Cloudflare 相关：
- **Account ID**：在 Cloudflare 仪表盘右下角
- **API Token**：在 My Profile → API Tokens → Create Token（需要 Workers 部署权限）
- **D1 数据库**：在 Workers → D1 中查看
- **KV 命名空间**：在 Workers → KV 中查看
- **R2 存储桶**：在 Workers → R2 中查看

### 其他：
- **LinuxDo OAuth**：在 LinuxDo 应用管理中创建
- **域名配置**：在域名管理器中配置 DNS 解析到 Cloudflare

## 🔧 本地开发

本地开发时，可在 `wrangler-dev.toml` 文件中配置这些变量。

---

## 📞 支持

如遇部署问题，请参考：
- [Cloud Mail 文档](https://doc.skymail.ink)
- [GitHub Issues](https://github.com/maillab/cloud-mail/issues)
- [Telegram 交流群](https://t.me/cloud_mail_tg)
