/**
 * 邮件队列服务
 *
 * 架构：
 * 用户请求 → Workers → 上传附件到R2 → 放入队列（只含R2键）→ 立即返回（<1秒）
 *                              ↓
 *                    异步消费者 → 从R2读取附件 → 本地 Docker API → SES
 */

import r2Service from './r2-service';

const queueService = {
    /**
     * 安全的 Base64 编码（兼容 Cloudflare Workers）
     * @param {string|Uint8Array} data - 要编码的数据
     * @returns {string} Base64 字符串
     */
    safeBase64Encode(data) {
        if (typeof data === 'string') {
            const encoder = new TextEncoder();
            data = encoder.encode(data);
        }
        if (data instanceof Uint8Array) {
            let binary = '';
            for (let i = 0; i < data.length; i++) {
                binary += String.fromCharCode(data[i]);
            }
            return btoa(binary);
        }
        return '';
    },

    /**
     * 安全的 Base64 解码（兼容 Cloudflare Workers）
     * @param {string} base64 - Base64 字符串
     * @returns {Uint8Array} 二进制数据
     */
    safeBase64Decode(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    },

    /**
     * 清理文件名（防止路径遍历攻击）
     * @param {string} filename - 原始文件名
     * @returns {string} 安全的文件名
     */
    sanitizeFilename(filename) {
        if (!filename) return 'attachment';
        // 只保留文件名部分，移除路径
        filename = filename.split('/').pop().split('\\').pop();
        // 移除危险字符
        filename = filename.replace(/\.\./g, '').replace(/[^\w\-. ]/g, '_');
        // 限制长度
        if (filename.length > 200) {
            const ext = filename.includes('.') ? '.' + filename.split('.').pop() : '';
            filename = filename.slice(0, 200 - ext.length) + ext;
        }
        return filename || 'attachment';
    },

    /**
     * 对文件名进行 RFC 2047 编码（用于 MIME 头部）
     * @param {string} filename - 文件名
     * @returns {string} 编码后的文件名
     */
    encodeMimeFilename(filename) {
        if (!filename) return 'attachment';
        // 检查是否需要编码（非 ASCII 字符）
        if (/^[\x20-\x7E]+$/.test(filename)) {
            // ASCII 字符，但需要转义引号和反斜杠
            return filename.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        }
        // 非 ASCII 字符，使用 UTF-8 Base64 编码
        const encoded = this.safeBase64Encode(filename);
        return `=?UTF-8?B?${encoded}?=`;
    },

    /**
     * 生成 R2 对象键
     * @param {string} filename - 文件名
     * @returns {string} R2 对象键
     */
    generateR2Key(filename) {
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        // 使用 Web Crypto API 生成随机字符串（兼容 Cloudflare Workers）
        const array = new Uint8Array(6);
        crypto.getRandomValues(array);
        const uuid = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
        const safeName = this.sanitizeFilename(filename);
        return `email-queue-att/${date}/${uuid}/${safeName}`;
    },

    /**
     * 上传附件到 R2
     * @param {Object} c - Hono context
     * @param {Array} attachments - 附件数组
     * @returns {Promise<Array>} 带 R2 键的附件数组（不含实际内容）
     */
    async uploadAttachmentsToR2(c, attachments) {
        if (!attachments || attachments.length === 0) {
            return [];
        }

        const r2Attachments = [];
        const uploadedKeys = []; // 跟踪已上传的键，用于失败时回滚

        try {
            for (const att of attachments) {
                const r2Key = this.generateR2Key(att.filename || 'attachment');

                // 将内容转换为 Uint8Array
                let content;
                if (att.content instanceof Uint8Array) {
                    content = att.content;
                } else if (typeof att.content === 'string') {
                    // 使用安全的 base64 解码
                    content = this.safeBase64Decode(att.content);
                } else {
                    content = new Uint8Array(0);
                }

                // 上传到 R2
                await r2Service.putObj(c, r2Key, content, {
                    contentType: att.contentType || 'application/octet-stream',
                    contentDisposition: `attachment; filename="${this.sanitizeFilename(att.filename || 'attachment')}"`,
                });

                uploadedKeys.push(r2Key);

                // 构建只含元数据的附件对象
                r2Attachments.push({
                    filename: this.sanitizeFilename(att.filename),
                    contentType: att.contentType,
                    contentId: att.contentId,
                    r2Key: r2Key,
                    size: content.length || content.byteLength,
                });

                console.log(`[Queue] Uploaded attachment to R2: ${r2Key}`);
            }

            return r2Attachments;
        } catch (error) {
            // 上传失败，清理已上传的附件
            console.error(`[Queue] Upload failed, cleaning up ${uploadedKeys.length} already uploaded attachments...`);
            for (const key of uploadedKeys) {
                try {
                    await r2Service.delete(c, key);
                    console.log(`[Queue] Cleaned up failed upload: ${key}`);
                } catch (cleanupError) {
                    console.warn(`[Queue] Failed to cleanup ${key}:`, cleanupError.message);
                }
            }
            throw error; // 重新抛出原始错误
        }
    },

    /**
     * 从 R2 下载附件
     * @param {Object} env - 环境变量
     * @param {Array} r2Attachments - 带 R2 键的附件数组
     * @returns {Promise<Array>} 完整的附件数组（含实际内容）
     */
    async downloadAttachmentsFromR2(env, r2Attachments) {
        if (!r2Attachments || r2Attachments.length === 0) {
            return [];
        }

        const attachments = [];

        for (const r2Att of r2Attachments) {
            if (!r2Att.r2Key) {
                // 如果没有 r2Key，说明已经是完整附件（向后兼容）
                attachments.push(r2Att);
                continue;
            }

            // 从 R2 读取内容
            const content = await r2Service.getObj({ env }, r2Att.r2Key);

            if (!content) {
                console.error(`[Queue] Failed to download attachment from R2: ${r2Att.r2Key}`);
                throw new Error(`Attachment not found in R2: ${r2Att.r2Key}`);
            }

            // 构建完整附件对象
            attachments.push({
                filename: r2Att.filename,
                contentType: r2Att.contentType,
                contentId: r2Att.contentId,
                content: content,
            });

            console.log(`[Queue] Downloaded attachment from R2: ${r2Att.r2Key}`);
        }

        return attachments;
    },

    /**
     * 清理 R2 中的临时附件
     * @param {Object} env - 环境变量
     * @param {Array} r2Attachments - 带 R2 键的附件数组
     */
    async cleanupR2Attachments(env, r2Attachments) {
        if (!r2Attachments || r2Attachments.length === 0) {
            return;
        }

        for (const r2Att of r2Attachments) {
            if (!r2Att.r2Key) {
                continue;
            }

            try {
                await r2Service.delete({ env }, r2Att.r2Key);
                console.log(`[Queue] Cleaned up temporary attachment: ${r2Att.r2Key}`);
            } catch (error) {
                // 清理失败不影响主流程，只记录警告
                console.warn(`[Queue] Failed to clean up attachment ${r2Att.r2Key}:`, error.message);
            }
        }
    },

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

        // 如果有附件，先上传到 R2，队列消息只保存 R2 键
        if (attachments && attachments.length > 0) {
            console.log(`[Queue] Uploading ${attachments.length} attachments to R2...`);
            emailData.attachments = await this.uploadAttachmentsToR2(c, attachments);
            console.log(`[Queue] Attachments uploaded, queue message will contain R2 keys only`);
        }

        try {
            // 发送到 Cloudflare Queue（消息体大幅减小）
            await c.env.EMAIL_QUEUE.send({
                type: 'send_email',
                data: emailData,
            });

            console.log(`[Queue] Email queued for: ${to}, subject: ${subject}, attachments: ${emailData.attachments?.length || 0}`);

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

        const { from, to, subject, text, html, headers, attachments } = data;

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

        // 如果有附件，从 R2 下载
        if (attachments && attachments.length > 0) {
            console.log(`[Queue] Downloading ${attachments.length} attachments from R2...`);
            try {
                requestBody.attachments = await this.downloadAttachmentsFromR2(env, attachments);
                console.log(`[Queue] Attachments downloaded from R2 successfully`);
            } catch (error) {
                console.error('[Queue] Failed to download attachments from R2:', error);
                return {
                    success: false,
                    error: `Failed to download attachments: ${error.message}`,
                };
            }
        }

        try {
            const localApiUrl = env.LOCAL_SES_API_URL;
            const apiKey = env.LOCAL_SES_API_KEY;

            if (!localApiUrl) {
                throw new Error('LOCAL_SES_API_URL not configured');
            }

            // 根据是否有附件选择不同的 API 端点
            const endpoint = requestBody.attachments ? '/send-raw-email' : '/send-email';

            // 如果有附件，需要构建 raw MIME 邮件
            let response;
            if (requestBody.attachments) {
                // 使用 send-raw-email 端点发送带附件的邮件
                const rawMessage = await this.buildRawEmail(requestBody);
                response = await fetch(`${localApiUrl}${endpoint}`, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        ...(apiKey && { 'x-api-key': apiKey }),
                    },
                    body: JSON.stringify({
                        from: requestBody.from,
                        to: requestBody.to,
                        rawMessage: rawMessage,
                    }),
                });
            } else {
                // 无附件，使用标准 send-email 端点
                response = await fetch(`${localApiUrl}${endpoint}`, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        ...(apiKey && { 'x-api-key': apiKey }),
                    },
                    body: JSON.stringify(requestBody),
                });
            }

            const result = await response.text();

            if (!response.ok) {
                throw new Error(`Local API failed: ${response.status} ${result}`);
            }

            const parsed = JSON.parse(result);

            if (!parsed.success) {
                throw new Error(parsed.error || 'Unknown error from Local API');
            }

            console.log(`[Queue] Email sent successfully: ${parsed.messageId}`);

            // 发送成功后清理 R2 中的临时附件
            if (attachments && attachments.length > 0) {
                await this.cleanupR2Attachments(env, attachments);
            }

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

    /**
     * 构建 MIME 格式的原始邮件（用于带附件的邮件）
     * @param {Object} params - 邮件参数
     * @returns {Promise<string>} base64 编码的原始邮件
     */
    async buildRawEmail(params) {
        const { from, to, subject, text, html, attachments, replyTo, inReplyTo, references } = params;

        const boundary = `----=_NextPart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const toAddresses = Array.isArray(to) ? to.join(', ') : to;

        let mimeParts = [];

        // 邮件头
        mimeParts.push(`From: ${from}`);
        mimeParts.push(`To: ${toAddresses}`);
        mimeParts.push(`Subject: =?UTF-8?B?${this.safeBase64Encode(subject || '')}?=`);
        mimeParts.push(`MIME-Version: 1.0`);
        mimeParts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

        if (replyTo) {
            mimeParts.push(`Reply-To: ${Array.isArray(replyTo) ? replyTo.join(', ') : replyTo}`);
        }
        if (inReplyTo) {
            mimeParts.push(`In-Reply-To: ${inReplyTo}`);
        }
        if (references) {
            mimeParts.push(`References: ${Array.isArray(references) ? references.join(' ') : references}`);
        }

        mimeParts.push('');
        mimeParts.push(`This is a multi-part message in MIME format.`);
        mimeParts.push('');

        // 文本正文部分
        if (text || html) {
            mimeParts.push(`--${boundary}`);
            if (html && !text) {
                mimeParts.push(`Content-Type: text/html; charset=UTF-8`);
                mimeParts.push(`Content-Transfer-Encoding: 8bit`);
                mimeParts.push('');
                mimeParts.push(html || '');
            } else if (text && !html) {
                mimeParts.push(`Content-Type: text/plain; charset=UTF-8`);
                mimeParts.push(`Content-Transfer-Encoding: 8bit`);
                mimeParts.push('');
                mimeParts.push(text);
            } else {
                // 同时有文本和 HTML
                const altBoundary = `----=_AltPart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                mimeParts.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
                mimeParts.push('');
                mimeParts.push(`--${altBoundary}`);
                mimeParts.push(`Content-Type: text/plain; charset=UTF-8`);
                mimeParts.push(`Content-Transfer-Encoding: 8bit`);
                mimeParts.push('');
                mimeParts.push(text);
                mimeParts.push('');
                mimeParts.push(`--${altBoundary}`);
                mimeParts.push(`Content-Type: text/html; charset=UTF-8`);
                mimeParts.push(`Content-Transfer-Encoding: 8bit`);
                mimeParts.push('');
                mimeParts.push(html);
                mimeParts.push('');
                mimeParts.push(`--${altBoundary}--`);
            }
            mimeParts.push('');
        }

        // 附件部分
        if (attachments && attachments.length > 0) {
            for (const att of attachments) {
                const safeFilename = this.sanitizeFilename(att.filename);
                const encodedFilename = this.encodeMimeFilename(att.filename);

                mimeParts.push(`--${boundary}`);
                mimeParts.push(`Content-Type: ${att.contentType || 'application/octet-stream'}; name="${encodedFilename}"`);
                mimeParts.push(`Content-Transfer-Encoding: base64`);
                mimeParts.push(`Content-Disposition: attachment; filename="${encodedFilename}"`);
                if (att.contentId) {
                    mimeParts.push(`Content-ID: <${att.contentId}>`);
                }
                mimeParts.push('');

                // 将内容转换为 base64（使用安全方法，避免栈溢出）
                let base64Content;
                if (att.content instanceof Uint8Array) {
                    // 使用 safeBase64Encode，内部使用循环而非展开运算符
                    base64Content = this.safeBase64Encode(att.content);
                } else if (typeof att.content === 'string') {
                    base64Content = this.safeBase64Encode(att.content);
                } else {
                    base64Content = '';
                }

                // 每76个字符换行（MIME 规范）
                const formattedBase64 = base64Content.match(/.{1,76}/g)?.join('\r\n') || base64Content;
                mimeParts.push(formattedBase64);
                mimeParts.push('');
            }
        }

        // 结束标记
        mimeParts.push(`--${boundary}--`);

        const rawMessage = mimeParts.join('\r\n');

        // 返回 base64 编码的消息（使用 Web API 而非 Buffer）
        return this.safeBase64Encode(rawMessage);
    },
};

export default queueService;
