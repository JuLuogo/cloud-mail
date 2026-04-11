import settingService from './setting-service.js';

const sesService = {
    /**
     * 构建 MIME 邮件的 boundary
     */
    generateBoundary() {
        return '----=_Part_' + Date.now() + '_' + Math.random().toString(36).substring(2);
    },

    /**
     * 将字符串编码为 quoted-printable
     */
    encodeQuotedPrintable(str) {
        // 简单的 quoted-printable 编码
        return str
            .replace(/[\x00-\x1F\x7F]/g, (char) => {
                const hex = char.charCodeAt(0).toString(16).toUpperCase();
                return '=' + (hex.length === 1 ? '0' + hex : hex);
            })
            .replace(/=/g, '=3D')
            .replace(/\r?\n/g, '=\r\n');
    },

    /**
     * 将字符串编码为 base64
     */
    encodeBase64(str) {
        if (typeof str === 'string') {
            // 如果是 base64 数据字符串，直接返回
            if (str.startsWith('data:')) {
                return str.split(',')[1] || '';
            }
            return btoa(unescape(encodeURIComponent(str)));
        }
        // 如果是 ArrayBuffer 或 Uint8Array
        if (str instanceof ArrayBuffer) {
            return btoa(String.fromCharCode(...new Uint8Array(str)));
        }
        if (str instanceof Uint8Array) {
            return btoa(String.fromCharCode(...str));
        }
        return btoa(unescape(encodeURIComponent(String(str))));
    },

    /**
     * 构建内嵌资源（图片）部分
     */
    buildInlinePart(part, boundary) {
        const contentId = part.contentId || part.cid;
        const filename = part.filename || 'attachment';
        const mimeType = part.mimeType || part.type || 'application/octet-stream';
        const content = part.content || part.contentData || '';

        const encoding = content.length > 0 ? 'base64' : 'base64';
        const encodedContent = this.encodeBase64(content);

        return [
            `--${boundary}`,
            `Content-Type: ${mimeType}; name="${filename}"`,
            `Content-Transfer-Encoding: ${encoding}`,
            `Content-ID: <${contentId}>`,
            `Content-Disposition: inline; filename="${filename}"`,
            '',
            encodedContent
        ].join('\r\n');
    },

    /**
     * 构建附件部分
     */
    buildAttachmentPart(part, boundary) {
        const filename = part.filename || 'attachment';
        const mimeType = part.mimeType || part.type || 'application/octet-stream';
        const content = part.content || part.contentData || '';

        const encodedContent = this.encodeBase64(content);

        return [
            `--${boundary}`,
            `Content-Type: ${mimeType}; name="${filename}"`,
            `Content-Transfer-Encoding: base64`,
            `Content-Disposition: attachment; filename="${filename}"`,
            '',
            encodedContent
        ].join('\r\n');
    },

    /**
     * 构建完整的 MIME 邮件
     */
    buildMimeEmail(params) {
        const { from, to, subject, text, html, headers, attachments } = params;

        // 定义 boundary
        const mixedBoundary = '----=_Part_boundary';
        const altBoundary = '----=_Part_alternative';

        // to 可能是数组
        const toAddresses = Array.isArray(to) ? to : [to];
        const toStr = toAddresses.join(', ');

        // 获取回复头
        let replyTo = null;
        let inReplyTo = null;
        let references = null;

        if (headers) {
            replyTo = headers['reply-to'] || null;
            inReplyTo = headers['in-reply-to'] || null;
            references = headers['references'] || null;
        }

        // 构建邮件头
        const subjectEncoded = Buffer.from(subject).toString('base64');

        const mimeHeaders = [
            `From: ${from}`,
            `To: ${toStr}`,
            `Subject: =?UTF-8?B?${subjectEncoded}?=`,
            `MIME-Version: 1.0`,
            `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`
        ];

        // 添加回复相关头
        if (replyTo) {
            mimeHeaders.push(`Reply-To: ${replyTo}`);
        }
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

        // 构建 HTML 部分
        let htmlContent = html || '';
        if (text && !htmlContent) {
            htmlContent = `<pre>${text}</pre>`;
        }

        // 分离内嵌图片和普通附件
        const inlineParts = [];
        const attachmentParts = [];

        if (attachments && attachments.length > 0) {
            for (const att of attachments) {
                if (att.contentId || att.cid) {
                    // 内嵌图片
                    inlineParts.push(att);
                } else {
                    // 普通附件
                    attachmentParts.push(att);
                }
            }
        }

        // 构建 multipart/alternative 部分（HTML + text）
        const textPart = [
            `--${altBoundary}`,
            `Content-Type: text/plain; charset=UTF-8`,
            `Content-Transfer-Encoding: 7bit`,
            '',
            text || '',
            ''
        ].join('\r\n');

        const htmlPart = [
            `--${altBoundary}`,
            `Content-Type: text/html; charset=UTF-8`,
            `Content-Transfer-Encoding: 8bit`,
            '',
            htmlContent,
            ''
        ].join('\r\n');

        const altPart = [
            `--${altBoundary}`,
            `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
            '',
            textPart,
            htmlPart,
            `--${altBoundary}--`
        ].join('\r\n');

        // 构建完整邮件体
        const parts = [altPart];

        // 添加内嵌图片
        for (const inline of inlineParts) {
            parts.push(this.buildInlinePart(inline, mixedBoundary));
        }

        // 添加普通附件
        for (const att of attachmentParts) {
            parts.push(this.buildAttachmentPart(att, mixedBoundary));
        }

        // 最终 MIME 邮件
        const mimeBody = [
            ...mimeHeaders,
            '',
            `--${mixedBoundary}`,
            `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
            '',
            altPart,
            '',
            ...inlineParts.map(inline => this.buildInlinePart(inline, mixedBoundary)),
            ...attachmentParts.map(att => this.buildAttachmentPart(att, mixedBoundary)),
            `--${mixedBoundary}--`,
            ''
        ].join('\r\n');

        return Buffer.from(mimeBody, 'utf-8');
    },

    async sendEmail(c, params) {
        const { from, to, subject, text, html, headers, attachments } = params;

        // 从设置中获取本地 SES API URL 和密钥
        const { localSesApiUrl, localSesApiKey } = await settingService.query(c);

        if (!localSesApiUrl) {
            throw new Error('Local SES API URL not configured. Please set LOCAL_SES_API_URL.');
        }

        // 如果有附件或内嵌图片，使用 Raw Email 格式
        if (attachments && attachments.length > 0) {
            console.log('[SES] Sending email with attachments via raw email format');

            // 构建 MIME 邮件
            const rawEmail = this.buildMimeEmail(params);

            try {
                const response = await fetch(`${localSesApiUrl}/send-raw-email`, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'content-length': rawEmail.length.toString(),
                        ...(localSesApiKey && { 'x-api-key': localSesApiKey }),
                    },
                    body: JSON.stringify({
                        from,
                        to: Array.isArray(to) ? to : [to],
                        rawMessage: rawEmail.toString('base64')
                    }),
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

        // 没有附件时，使用简单的 JSON 格式
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

        const bodyString = JSON.stringify(requestBody);

        // 调用本地 SES API
        try {
            const response = await fetch(`${localSesApiUrl}/send-email`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'content-length': bodyString.length.toString(),
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