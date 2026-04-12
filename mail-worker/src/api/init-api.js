import app from '../hono/hono';
import { dbInit } from '../init/init';

// 保留 GET 路径参数方式（向后兼容），同时支持 POST + Header 方式
app.get('/init/:secret', (c) => {
	return dbInit.init(c);
})

// 推荐方式：POST + Header 传递 secret，避免 secret 出现在 URL 和日志中
app.post('/init', (c) => {
	return dbInit.init(c);
})
