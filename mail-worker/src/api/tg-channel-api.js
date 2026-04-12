import app from '../hono/hono';
import result from '../model/result';
import tgChannelService from '../service/tg-channel-service';
import tgArchiveService from '../service/tg-archive-service';
import settingService from '../service/setting-service';

app.get('/tg/channels', async (c) => {
	const list = await tgChannelService.list(c);
	return c.json(result.ok(list));
});

app.post('/tg/channels', async (c) => {
	await tgChannelService.add(c, await c.req.json());
	return c.json(result.ok());
});

app.put('/tg/channels/:id', async (c) => {
	const id = parseInt(c.req.param('id'));
	const body = await c.req.json();
	body.id = id;
	await tgChannelService.update(c, body);
	return c.json(result.ok());
});

app.delete('/tg/channels/:id', async (c) => {
	const id = parseInt(c.req.param('id'));
	await tgChannelService.remove(c, id);
	return c.json(result.ok());
});

app.post('/tg/channels/:id/test', async (c) => {
	const id = parseInt(c.req.param('id'));
	const { tgBotToken } = await settingService.query(c);
	const res = await tgChannelService.testChannel(c, id, tgBotToken);
	return c.json(result.ok(res));
});

app.get('/tg/archive/stats', async (c) => {
	const stats = await tgArchiveService.getArchiveStats(c);
	return c.json(result.ok(stats));
});
