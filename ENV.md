# Cloud Mail 环境变量配置

## 📋 项目概述

Cloud Mail 是基于 Cloudflare Workers 和相关服务（D1、KV、R2）的邮件服务。正确配置环境变量对于项目的顺利运行至关重要。

## 🎯 必填变量

这些变量是项目正常运行所必需的，必须正确配置。

### 1. 基本配置

| 变量名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| `domain` | JSON array | 项目支持的邮箱域名列表 | `["example.com", "test.org"]` |
| `admin` | String | 超级管理员邮箱地址（用于管理界面） | `admin@example.com` |
| `jwt_secret` | String | JWT 令牌的密钥（用于身份验证） | `b7f29a1d-18e2-4d3b-941f-f6b2c97c02fd` |

## 📧 邮件发送配置

### Resend（默认发送方式）

| 变量名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| `resendTokens` | JSON object | 按域名配置的 Resend API 令牌（在系统设置中配置） | `{"example.com": "re_abc123"}` |

### Amazon SES（可选，需在系统设置中启用）

| 变量名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| `sesAccessKey` | String | AWS 访问密钥（在系统设置中配置） | `AKIAEXAMPLE123456789` |
| `sesSecretKey` | String | AWS 秘密访问密钥（在系统设置中配置） | `wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY` |
| `sesRegion` | String | AWS 区域（在系统设置中配置） | `us-east-1` |
| `sesEnabled` | Integer | 是否启用 SES 发送（0=启用，1=禁用） | `0` |
| `sesTokens` | JSON object | 按域名配置的 SES 凭证（在系统设置中配置） | `{"example.com": {"accessKey": "AKIAEXAMPLE", "secretKey": "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"}}` |

## 🔒 安全相关

### Turnstile 人机验证

| 变量名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| `siteKey` | String | Cloudflare Turnstile 的 Site Key（在系统设置中配置） | `0x4AAAAAAACqX5nIcBxN3nM` |
| `secretKey` | String | Cloudflare Turnstile 的 Secret Key（在系统设置中配置） | `0x4AAAAAAACqX5nIcBxN3nM` |

### OAuth 配置（可选）

| 变量名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| `linuxdo_switch` | Boolean | 是否启用 LinuxDo OAuth 登录 | `true` |
| `linuxdo_client_id` | String | LinuxDo OAuth 的 Client ID | `abc123def456` |
| `linuxdo_client_secret` | String | LinuxDo OAuth 的 Client Secret | `ghij789klm012` |
| `linuxdo_callback_url` | String | LinuxDo OAuth 的回调 URL | `https://your-domain.com/api/oauth/callback` |

## 📊 存储和资源配置

### Cloudflare R2 对象存储

| 变量名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| `bucket` | String | R2 存储桶名称 | `email-attachments` |
| `region` | String | R2 区域（可选，默认自动检测） | `auto` |
| `endpoint` | String | R2 自定义域名（可选） | `https://r2.example.com` |
| `s3AccessKey` | String | R2 访问密钥（可选） | `abc123def456` |
| `s3SecretKey` | String | R2 秘密访问密钥（可选） | `ghij789klm012` |
| `forcePathStyle` | Integer | 是否启用 S3 路径风格访问（0=启用，1=禁用） | `1` |

## 📡 邮件推送配置

### Telegram 机器人推送

| 变量名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| `tgBotToken` | String | Telegram 机器人 token（在系统设置中配置） | `123456789:ABC-DEF1234ghIkl-zyx57W2v1u123ew11` |
| `tgChatId` | String | Telegram 聊天 ID（多个用逗号分隔，在系统设置中配置） | `12345678,98765432` |
| `tgBotStatus` | Integer | 是否启用 Telegram 推送（0=启用，1=禁用） | `0` |
| `customDomain` | String | Worker 自定义域名（用于 Telegram 回调） | `https://your-domain.com` |

### 第三方邮箱转发

| 变量名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| `forwardEmail` | String | 转发到的第三方邮箱地址（多个用逗号分隔，在系统设置中配置） | `user@example.com,admin@test.org` |
| `forwardStatus` | Integer | 是否启用第三方邮箱转发（0=启用，1=禁用） | `0` |

## 🎨 个性化设置

| 变量名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| `title` | String | 网站标题（在系统设置中配置） | `Cloud Mail` |
| `background` | String | 登录背景图片 URL 或 base64（在系统设置中配置） | `https://example.com/background.jpg` |
| `loginOpacity` | Float | 登录框透明度（0-1，在系统设置中配置） | `0.88` |

## ⚙️ 其他配置

| 变量名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| `register` | Integer | 是否允许用户注册（0=允许，1=禁止） | `0` |
| `regKey` | Integer | 是否启用注册码功能（0=启用，1=禁用） | `0` |
| `send` | Integer | 是否允许邮件发送（0=允许，1=禁止） | `0` |
| `receive` | Integer | 是否允许邮件接收（0=允许，1=禁止） | `0` |
| `r2Domain` | String | R2 文件的访问域名（可选，用于附件下载） | `https://r2.example.com` |
| `noRecipient` | Integer | 是否允许无人接收的邮件（0=允许，1=禁止） | `0` |

## ☁️ Cloudflare 资源绑定

这些需要在 wrangler.toml 中配置，而不是通过环境变量。

### D1 数据库

```toml
[[d1_databases]]
binding = "db"
database_name = "cloud-mail-db"
database_id = "a4c1a63a-6ef5-4e6d-8e8c-b6d9e8feb810"
```

### KV 命名空间

```toml
[[kv_namespaces]]
binding = "kv"
id = "2io01d4b299e481b9de060ece9e7785c"
```

### R2 存储桶（可选，用于附件存储）

```toml
[[r2_buckets]]
binding = "r2"
bucket_name = "email-attachments"
```

## 📝 配置方式

### 1. 在 wrangler.toml 中直接配置

```toml
[vars]
domain = ["example.com", "test.org"]
admin = "admin@example.com"
jwt_secret = "b7f29a1d-18e2-4d3b-941f-f6b2c97c02fd"
```

### 2. 通过 GitHub Secrets（推荐用于生产环境）

在 GitHub 仓库的 Settings → Secrets and variables → Actions 中添加。

### 3. 在系统设置页面配置

大部分变量（如 Resend 令牌、SES 配置、Telegram 推送等）可以在系统设置页面中配置，而不需要直接修改配置文件。

## 🚀 部署前检查

部署前请确保：
1. 所有必填变量都已正确配置
2. Cloudflare 资源（D1、KV、R2）已创建并正确绑定
3. 如果使用 Resend 或 SES，相关服务的账户已验证
4. 域名已正确解析到 Cloudflare Workers

## 🔧 开发模式

对于开发模式，使用 `wrangler-dev.toml` 或 `.env.dev` 文件。

---

## 📚 资源链接

- [Cloud Mail 项目文档](https://doc.skymail.ink)
- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Resend API 文档](https://resend.com/docs)
- [Amazon SES API 文档](https://docs.aws.amazon.com/ses/)
