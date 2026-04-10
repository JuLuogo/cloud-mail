import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { SESClient, SendEmailCommand, SendRawEmailCommand } from '@aws-sdk/client-ses';

const app = express();
const PORT = process.env.PORT || 3000;

// API 密钥验证（通过环境变量配置）
const API_KEY = process.env.API_KEY;

// AWS SES 配置
const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// 中间件
app.use(cors());
app.use(express.json());

// API 密钥验证中间件
function validateApiKey(req, res, next) {
  if (!API_KEY) {
    console.warn('Warning: API_KEY not configured, skipping validation');
    return next();
  }

  const authHeader = req.headers['x-api-key'];
  if (!authHeader) {
    console.warn('Request rejected: Missing API key');
    return res.status(401).json({
      success: false,
      error: 'Missing API key'
    });
  }

  // 使用 timingSafeEqual 防止时序攻击
  const expectedKey = Buffer.from(API_KEY);
  const providedKey = Buffer.from(authHeader);

  if (expectedKey.length !== providedKey.length ||
      !crypto.timingSafeEqual(expectedKey, providedKey)) {
    console.warn('Request rejected: Invalid API key');
    return res.status(403).json({
      success: false,
      error: 'Invalid API key'
    });
  }

  next();
}

// 发送邮件接口
app.post('/send-email', validateApiKey, async (req, res) => {
  const requestId = crypto.randomUUID().slice(0, 8);

  try {
    const { from, to, subject, text, html, replyTo, inReplyTo, references } = req.body;

    console.log(`[${requestId}] Received email request:`, {
      from,
      to,
      subject,
      hasText: !!text,
      hasHtml: !!html,
      hasInReplyTo: !!inReplyTo,
      hasReferences: !!references
    });

    // 验证必需参数
    if (!from || !to || !subject) {
      console.warn(`[${requestId}] Missing required parameters`);
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: from, to, subject'
      });
    }

    // 如果有 inReplyTo 或 references，使用 Raw Email 发送（支持邮件头）
    if (inReplyTo || references) {
      console.log(`[${requestId}] Using raw email format for thread support`);

      // 构建 MIME 邮件
      const toAddresses = Array.isArray(to) ? to.join(', ') : to;
      const replyToAddresses = replyTo
        ? (Array.isArray(replyTo) ? replyTo.join(', ') : replyTo)
        : null;

      let mimeHeaders = [
        `From: ${from}`,
        `To: ${toAddresses}`,
        `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
        `MIME-Version: 1.0`,
        `Content-Type: text/html; charset=UTF-8`
      ];

      // 添加 Thread 头
      if (inReplyTo) {
        mimeHeaders.push(`In-Reply-To: ${inReplyTo}`);
      }
      if (references) {
        if (Array.isArray(references)) {
          mimeHeaders.push(`References: ${references.join(' ')}`);
        } else {
          mimeHeaders.push(`References: ${references}`);
        }
      }

      // 添加回复地址
      if (replyToAddresses) {
        mimeHeaders.push(`Reply-To: ${replyToAddresses}`);
      }

      // 构建邮件内容
      const htmlContent = html || (text ? `<pre>${text}</pre>` : '');
      const rawMessage = [
        ...mimeHeaders,
        '',
        htmlContent
      ].join('\r\n');

      console.log(`[${requestId}] Sending raw email...`);

      const params = {
        RawMessage: {
          Data: Buffer.from(rawMessage, 'utf-8'),
        },
      };

      // 如果有回复地址
      if (replyToAddresses) {
        params.FromEmailAddress = from;
      } else {
        params.FromEmailAddress = from;
      }

      const command = new SendRawEmailCommand(params);
      const result = await sesClient.send(command);

      console.log(`[${requestId}] Email sent successfully. MessageId: ${result.MessageId}`);

      return res.json({
        success: true,
        messageId: result.MessageId,
      });
    }

    // 标准 SendEmail（无线程头）
    const params = {
      Source: from,
      Destination: {
        ToAddresses: Array.isArray(to) ? to : [to],
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8',
        },
        Body: {},
      },
    };

    // 添加文本正文
    if (text) {
      params.Message.Body.Text = {
        Data: text,
        Charset: 'UTF-8',
      };
    }

    // 添加 HTML 正文
    if (html) {
      params.Message.Body.Html = {
        Data: html,
        Charset: 'UTF-8',
      };
    }

    // 添加回复地址
    if (replyTo) {
      params.ReplyToAddresses = Array.isArray(replyTo) ? replyTo : [replyTo];
    }

    console.log(`[${requestId}] Sending standard email...`);

    const command = new SendEmailCommand(params);
    const result = await sesClient.send(command);

    console.log(`[${requestId}] Email sent successfully. MessageId: ${result.MessageId}`);

    res.json({
      success: true,
      messageId: result.MessageId,
    });
  } catch (error) {
    console.error(`[${requestId}] Error sending email:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 健康检查（无需认证）
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    apiKeyConfigured: !!API_KEY
  });
});

app.listen(PORT, () => {
  console.log(`Local SES API server running on port ${PORT}`);
  console.log(`AWS Region: ${process.env.AWS_REGION || 'us-east-1'}`);
  console.log(`API Key configured: ${!!API_KEY}`);
});
