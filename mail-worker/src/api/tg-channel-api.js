import app from '../hono/hono';
import result from '../model/result';
import tgChannelService from '../service/tg-channel-service';
import tgArchiveService from '../service/tg-archive-service';
import settingService from '../service/setting-service';

app.get('/tg/channels/list', async (c) => {
	const list = await tgChannelService.list(c);
	return c.json(result.ok(list));
});

app.post('/tg/channels/add', async (c) => {
	await tgChannelService.add(c, await c.req.json());
	return c.json(result.ok());
});

app.post('/tg/channels/update', async (c) => {
	const body = await c.req.json();
	await tgChannelService.update(c, body);
	return c.json(result.ok());
});

app.post('/tg/channels/delete', async (c) => {
	const body = await c.req.json();
	await tgChannelService.remove(c, body.id);
	return c.json(result.ok());
});

app.post('/tg/channels/test', async (c) => {
	const body = await c.req.json();
	const { tgBotToken } = await settingService.query(c);
	const res = await tgChannelService.testChannel(c, body.id, tgBotToken);
	return c.json(result.ok(res));
});

app.get('/tg/archive/stats', async (c) => {
	const stats = await tgArchiveService.getArchiveStats(c);
	return c.json(result.ok(stats));
});
