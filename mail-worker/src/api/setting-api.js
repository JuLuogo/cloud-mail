import app from '../hono/hono';
import result from '../model/result';
import settingService from '../service/setting-service';
import userContext from '../security/user-context';

const getOperatorInfo = (c) => ({
	userId: userContext.getUserId(c),
	userEmail: userContext.getUser(c)?.email
});

app.put('/setting/set', async (c) => {
	await settingService.set(c, await c.req.json(), getOperatorInfo(c));
	return c.json(result.ok());
});

app.get('/setting/query', async (c) => {
	const setting = await settingService.get(c);
	return c.json(result.ok(setting));
});

app.get('/setting/websiteConfig', async (c) => {
	const setting = await settingService.websiteConfig(c);
	return c.json(result.ok(setting));
})

app.put('/setting/setBackground', async (c) => {
	const key = await settingService.setBackground(c, await c.req.json());
	return c.json(result.ok(key));
});

app.delete('/setting/deleteBackground', async (c) => {
	await settingService.deleteBackground(c);
	return c.json(result.ok());
});

app.post('/setting/cleanupTempFiles', async (c) => {
	const cleanupResult = await settingService.cleanupTempFiles(c, getOperatorInfo(c));
	return c.json(result.ok(cleanupResult));
});

app.get('/setting/tempFileStats', async (c) => {
	const stats = await settingService.getTempFileStats(c);
	return c.json(result.ok(stats));
});

app.post('/setting/cleanupRules', async (c) => {
	const cleanupResult = await settingService.cleanupRules(c, getOperatorInfo(c));
	return c.json(result.ok(cleanupResult));
});

app.get('/setting/ruleStats', async (c) => {
	const stats = await settingService.getRuleStats(c);
	return c.json(result.ok(stats));
});

