import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import kvObjService from './service/kv-obj-service';
import oauthService from "./service/oauth-service";
import queueService from './service/queue-service';
export default {
	 async fetch(req, env, ctx) {

		const url = new URL(req.url)

		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '')
			req = new Request(url.toString(), req)
			return app.fetch(req, env, ctx);
		}

		 if (['/static/','/attachments/'].some(p => url.pathname.startsWith(p))) {
			 return await kvObjService.toObjResp( { env }, url.pathname.substring(1));
		 }

		return env.assets.fetch(req);
	},
	email: email,
	async scheduled(c, env, ctx) {
		await verifyRecordService.clearRecord({ env })
		await userService.resetDaySendCount({ env })
		await emailService.completeReceiveAll({ env })
		await oauthService.clearNoBindOathUser({ env })
	},
	// Cloudflare Queues 消费者
	async queue(batch, env, ctx) {
		const messages = batch.messages;

		for (const message of messages) {
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
		}
	},
};
