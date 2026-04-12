import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import kvObjService from './service/kv-obj-service';
import oauthService from './service/oauth-service';
import queueService from './service/queue-service';
import settingService from './service/setting-service';
export default {
	async fetch(req, env, ctx) {
		const url = new URL(req.url);

		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '');
			req = new Request(url.toString(), req);
			return app.fetch(req, env, ctx);
		}

		return env.assets.fetch(req);
	},
	email: email,
	async scheduled(c, env, ctx) {
		const scheduledContext = { env };
		const systemOperator = { userId: 0, userEmail: 'system' };
		await Promise.all([
			verifyRecordService.clearRecord(scheduledContext),
			userService.resetDaySendCount(scheduledContext),
			emailService.completeReceiveAll(scheduledContext),
			oauthService.clearNoBindOathUser(scheduledContext),
			settingService.cleanupTempFiles(scheduledContext, systemOperator, true),
			settingService.cleanupRules(scheduledContext, systemOperator, true),
		]);
	},
	// Cloudflare Queues 消费者
	async queue(batch, env, ctx) {
		const messages = batch.messages;

		await Promise.all(
			messages.map(async (message) => {
				try {
					const result = await queueService.processEmailMessage(env, message.body);

					if (result.success) {
						message.ack();
					} else {
						// 处理失败，尝试重试
						console.error(`[Queue] Message failed: ${result.error}`);
						message.retry({ delaySeconds: 60 }); // 60秒后重试
					}
				} catch (error) {
					console.error('[Queue] Unexpected error:', error);
					message.retry({ delaySeconds: 60 });
				}
			}),
		);
	},
};
