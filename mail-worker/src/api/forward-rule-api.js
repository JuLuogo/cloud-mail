import app from '../hono/hono';
import forwardRuleService from '../service/forward-rule-service';
import result from '../model/result';
import userContext from '../security/user-context';

app.get('/forward-rule/list', async (c) => {
	const userId = userContext.getUserId(c);
	const isAdmin = c.env.admin === userContext.getUser(c)?.email;
	const list = await forwardRuleService.list(c, isAdmin ? 0 : userId);
	return c.json(result.ok(list));
});

app.post('/forward-rule/add', async (c) => {
	const userId = userContext.getUserId(c);
	const isAdmin = c.env.admin === userContext.getUser(c)?.email;

	const params = await c.req.json();

	await forwardRuleService.add(c, params, isAdmin ? 0 : userId);
	return c.json(result.ok());
});

app.put('/forward-rule/update', async (c) => {
	const userId = userContext.getUserId(c);
	await forwardRuleService.update(c, await c.req.json(), userId);
	return c.json(result.ok());
});

app.delete('/forward-rule/delete', async (c) => {
	const userId = userContext.getUserId(c);
	await forwardRuleService.delete(c, c.req.query(), userId);
	return c.json(result.ok());
});

app.put('/forward-rule/toggle', async (c) => {
	const userId = userContext.getUserId(c);
	await forwardRuleService.toggle(c, await c.req.json(), userId);
	return c.json(result.ok());
});