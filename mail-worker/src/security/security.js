import BizError from '../error/biz-error';
import constant from '../const/constant';
import jwtUtils from '../utils/jwt-utils';
import KvConst from '../const/kv-const';
import dayjs from 'dayjs';
import userService from '../service/user-service';
import permService from '../service/perm-service';
import { t } from '../i18n/i18n'
import app from '../hono/hono';

const exclude = [
	'/login',
	'/register',
	'/setting/websiteConfig',
	'/webhooks',
	'/init',
	'/public/genToken',
	'/telegram',
	'/test',
	'/oauth/login',
	'/oauth/linuxDo/callback'
];

const requirePerms = [
	'/email/send',
	'/email/delete',
	'/email/archive',
	'/email/unarchive',
	'/email/archiveList',
	'/email/list',
	'/email/latest',
	'/email/attList',
	'/email/read',
	'/email/search',
	'/account/list',
	'/account/delete',
	'/account/add',
	'/account/setName',
	'/account/setAllReceive',
	'/account/setAsTop',
	'/star/add',
	'/star/list',
	'/star/cancel',
	'/my/delete',
	'/analysis/echarts',
	'/role/add',
	'/role/list',
	'/role/delete',
	'/role/tree',
	'/role/set',
	'/role/setDefault',
	'/allEmail/list',
	'/allEmail/delete',
	'/allEmail/batchDelete',
	'/allEmail/latest',
	'/setting/setBackground',
	'/setting/deleteBackground',
	'/setting/set',
	'/setting/query',
	'/setting/cleanupTempFiles',
	'/setting/tempFileStats',
	'/setting/cleanupRules',
	'/setting/ruleStats',
	'/user/delete',
	'/user/setPwd',
	'/user/setStatus',
	'/user/setType',
	'/user/list',
	'/user/resetSendCount',
	'/user/restore',
	'/user/setAvailDomain',
	'/user/setForwardStatus',
	'/user/add',
	'/user/deleteAccount',
	'/user/allAccount',
	'/regKey/add',
	'/regKey/list',
	'/regKey/delete',
	'/regKey/clearNotUse',
	'/regKey/history',
	'/contact/list',
	'/contact/groupList',
	'/contact/add',
	'/contact/update',
	'/contact/delete',
	'/contact/toggleStar',
	'/contact/groupAdd',
	'/contact/groupUpdate',
	'/contact/groupDelete',
	'/filter/list',
	'/filter/add',
	'/filter/update',
	'/filter/delete',
	'/filter/toggle',
	'/audit/list',
	'/audit/detail',
	'/forward-rule/list',
	'/forward-rule/add',
	'/forward-rule/update',
	'/forward-rule/delete',
	'/forward-rule/toggle',
	'/tg/channels/list',
	'/tg/channels/add',
	'/tg/channels/update',
	'/tg/channels/delete',
	'/tg/channels/test',
	'/tg/archive'
];

const permKey = {
	'email:delete': ['/email/delete'],
	'email:send': ['/email/send'],
	'email:archive:query': ['/email/archiveList'],
	'email:archive': ['/email/archive', '/email/unarchive'],
	'email:query': ['/email/list', '/email/latest', '/email/search', '/email/read', '/email/attList'],
	'account:add': ['/account/add'],
	'account:query': ['/account/list'],
	'account:delete': ['/account/delete'],
	'account:setName': ['/account/setName'],
	'account:setAllReceive': ['/account/setAllReceive'],
	'account:setAsTop': ['/account/setAsTop'],
	'my:delete': ['/my/delete'],
	'role:add': ['/role/add'],
	'role:set': ['/role/set','/role/setDefault'],
	'role:query': ['/role/list', '/role/tree'],
	'role:delete': ['/role/delete'],
	'user:query': ['/user/list','/user/allAccount'],
	'user:add': ['/user/add'],
	'user:reset-send': ['/user/resetSendCount'],
	'user:set-pwd': ['/user/setPwd'],
	'user:set-status': ['/user/setStatus'],
	'user:set-type': ['/user/setType'],
	'user:delete': ['/user/delete','/user/deleteAccount'],
	'user:restore': ['/user/restore'],
	'user:set-avail-domain': ['/user/setAvailDomain'],
	'user:set-forward-status': ['/user/setForwardStatus'],
	'star:add': ['/star/add'],
	'star:query': ['/star/list'],
	'star:delete': ['/star/cancel'],
	'all-email:query': ['/allEmail/list','/allEmail/latest'],
	'all-email:delete': ['/allEmail/delete','/allEmail/batchDelete'],
	'setting:query': ['/setting/query'],
	'setting:set': ['/setting/set', '/setting/setBackground','/setting/deleteBackground'],
	'analysis:query': ['/analysis/echarts'],
	'reg-key:add': ['/regKey/add'],
	'reg-key:query': ['/regKey/list','/regKey/history'],
	'reg-key:delete': ['/regKey/delete','/regKey/clearNotUse'],
	'contact:query': ['/contact/list', '/contact/groupList'],
	'contact:add': ['/contact/add', '/contact/groupAdd'],
	'contact:update': ['/contact/update', '/contact/toggleStar', '/contact/groupUpdate'],
	'contact:delete': ['/contact/delete', '/contact/groupDelete'],
	'filter:query': ['/filter/list'],
	'filter:add': ['/filter/add'],
	'filter:update': ['/filter/update', '/filter/toggle'],
	'filter:delete': ['/filter/delete'],
	'audit:query': ['/audit/list', '/audit/detail'],
	'forward-rule:query': ['/forward-rule/list'],
	'forward-rule:add': ['/forward-rule/add'],
	'forward-rule:update': ['/forward-rule/update', '/forward-rule/toggle'],
	'forward-rule:delete': ['/forward-rule/delete'],
	'temp-file-clean:query': ['/setting/tempFileStats'],
	'temp-file-clean:action': ['/setting/cleanupTempFiles'],
	'rule-clean:query': ['/setting/ruleStats'],
	'rule-clean:action': ['/setting/cleanupRules'],
	'tg-channel:query': ['/tg/channels/list', '/tg/archive'],
	'tg-channel:add': ['/tg/channels/add', '/tg/channels/test'],
	'tg-channel:update': ['/tg/channels/update'],
	'tg-channel:delete': ['/tg/channels/delete'],
};

app.use('*', async (c, next) => {

	const path = c.req.path;

	const index = exclude.findIndex(item => {
		return path.startsWith(item);
	});

	if (index > -1) {
		return await next();
	}

	if (path.startsWith('/public')) {

		const userPublicToken = await c.env.kv.get(KvConst.PUBLIC_KEY);
		const publicToken = c.req.header(constant.TOKEN_HEADER);
		if (publicToken !== userPublicToken) {
			throw new BizError(t('publicTokenFail'), 401);
		}
		return await next();
	}


	const jwt = c.req.header(constant.TOKEN_HEADER);

	const result = await jwtUtils.verifyToken(c, jwt);

	if (!result) {
		throw new BizError(t('authExpired'), 401);
	}

	const { userId, token } = result;
	const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });

	if (!authInfo) {
		throw new BizError(t('authExpired'), 401);
	}

	if (!authInfo.tokens.includes(token)) {
		throw new BizError(t('authExpired'), 401);
	}

	const permIndex = requirePerms.findIndex(item => {
		return path.startsWith(item);
	});

	if (permIndex > -1) {

		const permKeys = await permService.userPermKeys(c, authInfo.user.userId);

		const userPaths = permKeyToPaths(permKeys);

		const userPermIndex = userPaths.findIndex(item => {
			return path.startsWith(item);
		});

		if (userPermIndex === -1 && authInfo.user.email !== c.env.admin) {
			throw new BizError(t('unauthorized'), 403);
		}

	}

	const refreshTime = dayjs(authInfo.refreshTime).startOf('day');
	const nowTime = dayjs().startOf('day')

	if (!nowTime.isSame(refreshTime)) {
		authInfo.refreshTime = dayjs().toISOString();
		await userService.updateUserInfo(c, authInfo.user.userId);
		await c.env.kv.put(KvConst.AUTH_INFO + userId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });
	}

	c.set('user',authInfo.user)

	return await next();
});

function permKeyToPaths(permKeys) {

	const paths = [];

	for (const key of permKeys) {
		const routeList = permKey[key];
		if (routeList && Array.isArray(routeList)) {
			paths.push(...routeList);
		}
	}
	return paths;
}
