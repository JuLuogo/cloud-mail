import r2Service from '../service/r2-service';
import app from '../hono/hono';

app.get('/oss/*', async (c) => {
	const key = c.req.path.split('/oss/')[1];
	if (!key) {
		return c.text('Not Found', 404);
	}
	const obj = await r2Service.getObj(c, key);
	if (!obj) {
		return c.text('Not Found', 404);
	}
	return new Response(obj.body, {
		headers: {
			'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
			'Content-Disposition': obj.httpMetadata?.contentDisposition || null
		}
	});
});


