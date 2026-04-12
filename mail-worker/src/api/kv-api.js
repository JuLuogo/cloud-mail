import app from '../hono/hono';
import kvObjService from '../service/kv-obj-service';
import constant from '../const/constant';

// 受保护的静态资源访问路由（需要 JWT 认证）
// /static/* 用于访问静态资源（如背景图）
app.get('/static/*', async (c) => {
	const key = 'static/' + c.req.path.split('/static/')[1];
	return await kvObjService.toObjResp(c, key);
});

// /attachments/* 用于访问邮件附件（需要 JWT 认证）
app.get('/attachments/*', async (c) => {
	const key = c.req.path.split('/attachments/')[1];
	if (!key) {
		return c.text('Not Found', 404);
	}
	return await kvObjService.toObjResp(c, key);
});
