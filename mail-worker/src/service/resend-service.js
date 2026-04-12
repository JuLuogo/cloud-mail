import emailService from './email-service';
import { emailConst } from '../const/entity-const';
import BizError from '../error/biz-error';

const resendService = {

	/**
	 * 验证 Resend Webhook 签名
	 * Resend 使用 Svix 签名格式: svix-signature: t=timestamp,v1=signature
	 */
	async verifyWebhookSignature(c, rawBody) {
		const webhookSecret = c.env.RESEND_WEBHOOK_SECRET;

		// 未配置 secret 时拒绝请求，不跳过验证
		if (!webhookSecret) {
			console.warn('[Webhook] RESEND_WEBHOOK_SECRET not configured, rejecting request');
			return false;
		}

		const signature = c.req.header('svix-signature');
		const timestamp = c.req.header('svix-timestamp');

		if (!signature || !timestamp) {
			console.warn('[Webhook] Missing svix-signature or svix-timestamp header');
			return false;
		}

		// 检查 timestamp 是否在 5 分钟内，防止重放攻击
		const now = Math.floor(Date.now() / 1000);
		const webhookTimestamp = parseInt(timestamp, 10);
		if (isNaN(webhookTimestamp) || Math.abs(now - webhookTimestamp) > 300) {
			console.warn('[Webhook] Timestamp too old or invalid, possible replay attack');
			return false;
		}

		// 解析签名头 (格式: t=timestamp,v1=signature)
		const parts = signature.split(',');
		let v1Signature = null;

		for (const part of parts) {
			if (part.startsWith('v1=')) {
				v1Signature = part.substring(3);
				break;
			}
		}

		if (!v1Signature) {
			console.warn('[Webhook] No v1 signature found');
			return false;
		}

		// 计算期望的签名
		const encoder = new TextEncoder();
		const key = await crypto.subtle.importKey(
			'raw',
			encoder.encode(webhookSecret),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);

		const data = `${timestamp}.${rawBody}`;
		const signatureBuffer = await crypto.subtle.sign(
			'HMAC',
			key,
			encoder.encode(data)
		);

		const sigBytes = new Uint8Array(signatureBuffer);
		let sigBinary = '';
		for (let i = 0; i < sigBytes.length; i++) {
			sigBinary += String.fromCharCode(sigBytes[i]);
		}
		const expectedSignature = btoa(sigBinary);

		// 使用 timingSafeEqual 防止时序攻击
		const sigBuffer = Buffer.from(v1Signature);
		const expectedBuffer = Buffer.from(expectedSignature);

		if (sigBuffer.length !== expectedBuffer.length ||
			!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
			console.warn('[Webhook] Signature verification failed');
			return false;
		}

		return true;
	},

	async webhooks(c, rawBody) {
		// Webhook 签名验证（直接使用原始请求体，避免重新序列化导致签名不一致）
		const isValid = await this.verifyWebhookSignature(c, rawBody);
		const body = JSON.parse(rawBody);

		if (!isValid) {
			throw new BizError('Invalid webhook signature', 401);
		}

		const params = {
			resendEmailId: body.data.email_id,
			status: emailConst.status.SENT
		}

		if (body.type === 'email.delivered') {
			params.status = emailConst.status.DELIVERED
			params.message = null
		}

		if (body.type === 'email.complained') {
			params.status = emailConst.status.COMPLAINED
			params.message = null
		}

		if (body.type === 'email.bounced') {
			let bounce = body.data.bounce
			bounce = JSON.stringify(bounce);
			params.status = emailConst.status.BOUNCED
			params.message = bounce
		}

		if (body.type === 'email.delivery_delayed') {
			params.status = emailConst.status.DELAYED
			params.message = null
		}

		if (body.type === 'email.failed') {
			params.status = emailConst.status.FAILED
			params.message = body.data.failed.reason
		}

		const emailRow = await emailService.updateEmailStatus(c, params)

		if (!emailRow) {
			throw new BizError('更新邮件状态记录失败');
		}

	}
}

export default resendService
