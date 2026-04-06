import settingService from './setting-service.js';

// AWS Signature V4 相关函数
const awsSignatureV4 = {
    // 生成规范请求
    async generateCanonicalRequest(method, uri, queryParams, headers, payload) {
        const sortedHeaders = Object.keys(headers)
            .map(key => key.toLowerCase())
            .sort();

        const canonicalHeaders = sortedHeaders
            .map(key => `${key}:${headers[key]}`)
            .join('\n');

        const signedHeaders = sortedHeaders.join(';');

        const payloadHash = await this.hashSHA256(payload);

        return `${method}\n${uri}\n${this.encodeQueryParams(queryParams)}\n${canonicalHeaders}\n\n${signedHeaders}\n${payloadHash}`;
    },

    // 生成字符串用于签名
    generateStringToSign(algorithm, amzDate, credentialScope, canonicalRequestHash) {
        return `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;
    },

    // 生成签名密钥
    async generateSigningKey(secretKey, date, region, service) {
        const kDate = await this.hmacSHA256(
            new TextEncoder().encode('AWS4' + secretKey),
            new TextEncoder().encode(date)
        );
        const kRegion = await this.hmacSHA256(kDate, new TextEncoder().encode(region));
        const kService = await this.hmacSHA256(kRegion, new TextEncoder().encode(service));
        const kSigning = await this.hmacSHA256(kService, new TextEncoder().encode('aws4_request'));
        return kSigning;
    },

    // 计算 HMAC-SHA256
    async hmacSHA256(key, data) {
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            key,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        return await crypto.subtle.sign('HMAC', cryptoKey, data);
    },

    // 计算 SHA256 哈希
    async hashSHA256(data) {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    },

    // 编码查询参数
    encodeQueryParams(params) {
        return Object.keys(params)
            .sort()
            .map(key => `${key}=${encodeURIComponent(params[key])}`)
            .join('&');
    }
};

const sesService = {
    async sendEmail(c, params) {
        const { from, to, subject, text, html } = params;

        const { sesAccessKey, sesSecretKey, sesRegion, sesTokens } = await settingService.query(c);

        const domain = from.split('@')[1];
        let accessKey = sesAccessKey;
        let secretKey = sesSecretKey;

        if (sesTokens[domain]) {
            // sesTokens[domain] 直接就是 secret key，和 resendTokens 格式一样
            secretKey = sesTokens[domain];
        }

        const region = sesRegion || 'us-east-1';
        const endpoint = `https://email.${region}.amazonaws.com`;
        const path = '/v2/email/outbound-emails';

        // 构建请求参数 - 使用 JSON 格式
        const requestBody = {
            FromEmailAddress: from,
            Destination: {
                ToAddresses: [to]
            },
            Content: {
                Simple: {
                    Subject: {
                        Data: subject,
                        Charset: 'UTF-8'
                    },
                    Body: {}
                }
            }
        };

        if (text) {
            requestBody.Content.Simple.Body.Text = {
                Data: text,
                Charset: 'UTF-8'
            };
        }

        if (html) {
            requestBody.Content.Simple.Body.Html = {
                Data: html,
                Charset: 'UTF-8'
            };
        }

        const bodyString = JSON.stringify(requestBody);

        // AWS Signature V4 签名 - 必须在发送请求时生成时间戳
        function getAmzDate(date = new Date()) {
            const y = date.getUTCFullYear();
            const m = String(date.getUTCMonth() + 1).padStart(2, '0');
            const d = String(date.getUTCDate()).padStart(2, '0');
            const h = String(date.getUTCHours()).padStart(2, '0');
            const min = String(date.getUTCMinutes()).padStart(2, '0');
            const s = String(date.getUTCSeconds()).padStart(2, '0');
            return `${y}${m}${d}T${h}${min}${s}Z`;
        }
        const amzDate = getAmzDate();
        const dateStamp = amzDate.slice(0, 8);

        // 调试日志
        console.log("amzDate:", amzDate);

        const queryParams = {};
        // Header 必须按字母顺序排列
        const headers = {
            'content-length': bodyString.length.toString(),
            'content-type': 'application/json',
            'host': `email.${region}.amazonaws.com`,
            'x-amz-content-sha256': await awsSignatureV4.hashSHA256(bodyString),
            'x-amz-date': amzDate
        };

        const canonicalRequest = await awsSignatureV4.generateCanonicalRequest(
            'POST',
            path,
            queryParams,
            headers,
            bodyString
        );

        const credentialScope = `${dateStamp}/${region}/ses/aws4_request`;
        const canonicalRequestHash = await awsSignatureV4.hashSHA256(canonicalRequest);
        const stringToSign = awsSignatureV4.generateStringToSign(
            'AWS4-HMAC-SHA256',
            amzDate,
            credentialScope,
            canonicalRequestHash
        );

        const signingKey = await awsSignatureV4.generateSigningKey(
            secretKey,
            dateStamp,
            region,
            'ses'
        );

        const signatureBytes = await awsSignatureV4.hmacSHA256(
            signingKey,
            new TextEncoder().encode(stringToSign)
        );
        const signature = Array.from(new Uint8Array(signatureBytes))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        headers['authorization'] = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${Object.keys(headers).map(k => k.toLowerCase()).sort().join(';')}, Signature=${signature}`;

        // 发送请求
        try {
            const response = await fetch(endpoint + path, {
                method: 'POST',
                headers: headers,
                body: bodyString
            });

            const responseText = await response.text();

            if (!response.ok) {
                throw new Error(`SES API request failed: ${response.status} ${responseText}`);
            }

            const data = JSON.parse(responseText);

            return {
                id: data.MessageId,
                data: data
            };
        } catch (error) {
            throw new Error(`Failed to send email via SES: ${error.message}`);
        }
    }
};

export default sesService;