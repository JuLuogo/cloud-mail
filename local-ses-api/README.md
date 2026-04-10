# Local SES API

本地 Docker 服务，使用 AWS SDK 发送邮件。通过 Cloudflare Workers Queue 异步调用本地 API 转发邮件请求。

## 架构

```
用户/前端 → Cloudflare Workers → 放入队列 → 立即返回（<1秒）
                              ↓
                    异步消费者 → 本地 Docker API → AWS SES
```

### 同步模式（无队列）

```
用户请求 → Workers → 直接调用本地 API → 等待结果 → 返回响应
                              ↓
                    本地 Docker API → AWS SES
```

## 快速开始

### 1. 配置环境变量

```bash
cd local-ses-api
cp .env.example .env
# 编辑 .env 文件，填入 AWS 凭据
```

### 2. 启动服务

```bash
# 使用 Docker Compose
docker-compose up -d

# 或使用 Docker
docker build -t local-ses-api .
docker run -d -p 3000:3000 \
  -e AWS_ACCESS_KEY_ID=your_key \
  -e AWS_SECRET_ACCESS_KEY=your_secret \
  -e AWS_REGION=us-east-1 \
  --name local-ses-api \
  local-ses-api
```

### 3. 验证服务

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"2026-04-10T12:00:00.000Z"}
```

## API 接口

### 发送邮件

```
POST /send-email
Content-Type: application/json
X-API-Key: your_api_key (可选)
```

**请求参数：**

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| from | string | 是 | 发件人邮箱 |
| to | string/array | 是 | 收件人邮箱 |
| subject | string | 是 | 邮件主题 |
| text | string | 否 | 纯文本正文 |
| html | string | 否 | HTML 正文 |
| replyTo | string/array | 否 | 回复地址 |
| inReplyTo | string | 否 | 原始邮件 ID（用于回复线程） |
| references | string | 否 | 邮件引用 ID（用于回复线程） |

**示例：**

```bash
curl -X POST http://localhost:3000/send-email \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key" \
  -d '{
    "from": "sender@example.com",
    "to": "recipient@example.com",
    "subject": "Test Email",
    "text": "Hello World"
  }'
```

**响应：**

```json
{
  "success": true,
  "messageId": "00000000000000-00000000-0000"
}
```

## Cloudflare Workers 配置

### 方式一：启用队列模式（推荐）

在 `wrangler.toml` 或 GitHub Secrets 中添加：

```toml
# wrangler.toml
[vars]
queue_enabled = "true"
local_ses_api_url = "https://your-tunnel.trycloudflare.com"
local_ses_api_key = "your_api_key"

[[queues]]
binding = "EMAIL_QUEUE"
queue = "email-queue"
```

或在 GitHub Secrets 中添加：
- `QUEUE_ENABLED=true`
- `LOCAL_SES_API_URL=https://your-tunnel.trycloudflare.com`
- `LOCAL_SES_API_KEY=your_api_key`

### 方式二：同步模式（无队列）

不设置 `queue_enabled` 或设置为 `false`，Workers 会直接调用本地 API。

## 暴露到公网

本地服务需要暴露到公网供 Cloudflare Workers 访问。

### 方式一：Cloudflare Tunnel（推荐）

```bash
# 安装 cloudflared
brew install cloudflare/cloudflare/cloudflared

# 创建隧道
cloudflared tunnel --url http://localhost:3000

# 会得到一个 *.trycloudflare.com 的域名
```

### 方式二：frp 内网穿透

```bash
# frps.ini (服务器端)
[common]
bind_port = 7000

# frpc.ini (客户端)
[common]
server_addr = your_server_ip
server_port = 7000

[local-ses-api]
type = tcp
local_ip = 127.0.0.1
local_port = 3000
remote_port = 3000
```

## 故障排除

### 1. 服务无法启动

```bash
# 检查 Docker 日志
docker logs local-ses-api

# 检查环境变量
docker exec local-ses-api env
```

### 2. AWS 权限问题

确保 IAM 用户有 `ses:SendEmail` 权限：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ],
      "Resource": "*"
    }
  ]
}
```

### 3. SES 发送限制

- 沙箱模式：只能发送至已验证的邮箱
- 生产模式：需申请提高发送限制

## 安全建议

1. **使用 IAM 临时凭据** 而非长期 Access Key
2. **限制 API 访问来源**，只允许 Cloudflare Workers IP 访问
3. **启用 HTTPS** 确保传输安全
4. **添加 API 密钥验证**，防止滥用
5. **队列模式**：Workers 快速返回，邮件异步发送，用户体验更好
