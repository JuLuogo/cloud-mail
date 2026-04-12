import resendService from '../service/resend-service';
import app from '../hono/hono';
app.post('/webhooks',async (c) => {
	try {
		const rawBody = await c.req.text();
		await resendService.webhooks(c, rawBody);
		return c.text('success', 200)
	} catch (e) {
		const status = e.message.includes('Invalid webhook signature') ? 401 : 500;
		return c.text(e.message, status)
	}
})
