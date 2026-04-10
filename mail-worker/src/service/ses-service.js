import settingService from './setting-service.js';

const sesService = {
    async sendEmail(c, params) {
        const { from, to, subject, text, html, headers } = params;

        // 从设置中获取本地 SES API URL 和密钥
        const { localSesApiUrl, localSesApiKey } = await settingService.query(c);

        if (!localSesApiUrl) {
            throw new Error('Local SES API URL not configured. Please set LOCAL_SES_API_URL.');
        }

        // 构建请求参数
        const requestBody = {
            from,
            to,
            subject,
        };

        if (text) {
            requestBody.text = text;
        }

        if (html) {
            requestBody.html = html;
        }

        // 支持回复邮件的线程头
        if (headers) {
            if (headers['reply-to']) {
                requestBody.replyTo = headers['reply-to'];
            }
            if (headers['in-reply-to']) {
                requestBody.inReplyTo = headers['in-reply-to'];
            }
            if (headers['references']) {
                requestBody.references = headers['references'];
            }
        }

        // TODO: 附件支持（需要 Raw Email 格式）
        if (params.attachments && params.attachments.length > 0) {
            console.warn('Attachments are not yet supported in local SES API mode');
        }

        const bodyString = JSON.stringify(requestBody);

        // 调用本地 SES API
        try {
            const response = await fetch(`${localSesApiUrl}/send-email`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'content-length': bodyString.length.toString(),
                    // API 密钥验证（可选，如果本地 API 配置了 API_KEY）
                    ...(localSesApiKey && { 'x-api-key': localSesApiKey }),
                },
                body: bodyString,
            });

            const responseText = await response.text();

            if (!response.ok) {
                throw new Error(`Local SES API request failed: ${response.status} ${responseText}`);
            }

            const data = JSON.parse(responseText);

            if (!data.success) {
                throw new Error(data.error || 'Unknown error from Local SES API');
            }

            return {
                id: data.messageId,
                data: data,
            };
        } catch (error) {
            throw new Error(`Failed to send email via Local SES API: ${error.message}`);
        }
    }
};

export default sesService;