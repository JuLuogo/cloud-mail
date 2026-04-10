/**
 * 邮件队列服务
 *
 * 架构：
 * 用户请求 → Workers → 放入队列 → 立即返回（<1秒）
 *                              ↓
 *                    异步消费者 → 本地 Docker API → SES
 */

const queueService = {
    /**
     * 发送邮件到队列（异步）
     * @param {Object} c - Hono context
     * @param {Object} params - 邮件参数
     * @returns {Promise<{success: boolean, queuedAt: string}>}
     */
    async enqueueEmail(c, params) {
        const { from, to, subject, text, html, headers, attachments } = params;

        // 邮件数据
        const emailData = {
            from,
            to,
            subject,
            queuedAt: new Date().toISOString(),
        };

        if (text) emailData.text = text;
        if (html) emailData.html = html;
        if (headers) emailData.headers = headers;
        if (attachments) emailData.attachments = attachments;

        try {
            // 发送到 Cloudflare Queue
            await c.env.EMAIL_QUEUE.send({
                type: 'send_email',
                data: emailData,
            });

            console.log(`[Queue] Email queued for: ${to}, subject: ${subject}`);

            return {
                success: true,
                queuedAt: emailData.queuedAt,
            };
        } catch (error) {
            console.error('[Queue] Failed to enqueue email:', error);
            throw error;
        }
    },

    /**
     * 从队列处理邮件（消费者调用）
     * @param {Object} env - 环境变量
     * @param {Object} message - 队列消息
     * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
     */
    async processEmailMessage(env, message) {
        const { type, data } = message;

        if (type !== 'send_email') {
            return { success: false, error: `Unknown message type: ${type}` };
        }

        const { from, to, subject, text, html, headers } = data;

        // 构建请求参数
        const requestBody = {
            from,
            to,
            subject,
        };

        if (text) requestBody.text = text;
        if (html) requestBody.html = html;
        if (headers) {
            if (headers['reply-to']) requestBody.replyTo = headers['reply-to'];
            if (headers['in-reply-to']) requestBody.inReplyTo = headers['in-reply-to'];
            if (headers['references']) requestBody.references = headers['references'];
        }

        try {
            const localApiUrl = env.LOCAL_SES_API_URL;
            const apiKey = env.LOCAL_SES_API_KEY;

            if (!localApiUrl) {
                throw new Error('LOCAL_SES_API_URL not configured');
            }

            const response = await fetch(`${localApiUrl}/send-email`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    ...(apiKey && { 'x-api-key': apiKey }),
                },
                body: JSON.stringify(requestBody),
            });

            const result = await response.text();

            if (!response.ok) {
                throw new Error(`Local API failed: ${response.status} ${result}`);
            }

            const parsed = JSON.parse(result);

            if (!parsed.success) {
                throw new Error(parsed.error || 'Unknown error from Local API');
            }

            console.log(`[Queue] Email sent successfully: ${parsed.messageId}`);

            return {
                success: true,
                messageId: parsed.messageId,
            };
        } catch (error) {
            console.error('[Queue] Failed to send email:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    },
};

export default queueService;
