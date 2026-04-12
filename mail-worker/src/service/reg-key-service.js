import orm from '../entity/orm';
import regKey from '../entity/reg-key';
import { inArray, like, eq, desc, sql, or } from 'drizzle-orm';
import roleService from './role-service';
import BizError from '../error/biz-error';
import { formatDetailDate, toUtc } from '../utils/date-uitil';
import userService from './user-service';
import { t } from '../i18n/i18n.js';
import auditService from './audit-service';
import { auditConst } from '../entity/audit-log';

const regKeyService = {

	async add(c, params, userId, operatorInfo) {

		let {code,roleId,count,expireTime} = params;

		if (!code) {
			throw new BizError(t('emptyRegKey'));
		}

		if (!count) {
			throw new BizError(t('emptyRegKey'));
		}

		if (!expireTime) {
			throw new BizError(t('emptyRegKeyExpire'));
		}

		const regKeyRow = await orm(c).select().from(regKey).where(eq(regKey.code, code)).get();

		if (regKeyRow) {
			throw new BizError(t('isExistRegKye'));
		}

		const roleRow = await roleService.selectById(c, roleId);
		if (!roleRow) {
			throw new BizError(t('roleNotExist'));
		}

		expireTime = formatDetailDate(expireTime)

		await orm(c).insert(regKey).values({code,roleId,count,userId,expireTime}).run();

		// 审计日志
		await auditService.log(c, {
			userId: operatorInfo.userId,
			userEmail: operatorInfo.userEmail,
			action: auditConst.action.REG_KEY_CREATE,
			targetType: auditConst.targetType.REG_KEY,
			targetId: code,
			targetDesc: code,
			detail: { code, roleId, count, expireTime }
		});
	},

	async delete(c, params, operatorInfo) {
		let {regKeyIds} = params;
		regKeyIds = regKeyIds.split(',').map(id => Number(id));
		const regKeys = await orm(c).select().from(regKey).where(inArray(regKey.regKeyId, regKeyIds)).all();
		await orm(c).delete(regKey).where(inArray(regKey.regKeyId,regKeyIds)).run();

		// 审计日志
		for (const regKeyRow of regKeys) {
			await auditService.log(c, {
				userId: operatorInfo.userId,
				userEmail: operatorInfo.userEmail,
				action: auditConst.action.REG_KEY_DELETE,
				targetType: auditConst.targetType.REG_KEY,
				targetId: String(regKeyRow.regKeyId),
				targetDesc: regKeyRow.code,
				detail: { code: regKeyRow.code }
			});
		}
	},

	async clearNotUse(c) {
		// 使用 UTC 时间比较，避免硬编码时区
		let now = formatDetailDate(toUtc().startOf('day'))
		await orm(c).delete(regKey).where(or(eq(regKey.count, 0),sql`datetime(${regKey.expireTime}) < datetime(${now})`)).run();
	},

	selectByCode(c, code) {
		return orm(c).select().from(regKey).where(eq(regKey.code, code)).get();
	},

	async list(c, params) {

		const {code} = params
		let query = orm(c).select().from(regKey)

		if (code) {
			query = query.where(like(regKey.code, `${code}%`))
		}

		const regKeyList = await query.orderBy(desc(regKey.regKeyId)).all();
		const roleList = await roleService.roleSelectUse(c);

		const today = toUtc().tz('Asia/Shanghai').startOf('day')

		regKeyList.forEach(regKeyRow => {

			const index = roleList.findIndex(roleRow => roleRow.roleId === regKeyRow.roleId)
			regKeyRow.roleName = index > -1 ? roleList[index].name : ''

			const expireTime = toUtc(regKeyRow.expireTime).tz('Asia/Shanghai').startOf('day');

			if (expireTime.isBefore(today)) {
				regKeyRow.expireTime = null
			}
		})

		return regKeyList;
	},

	async reduceCount(c, code, count) {
		await orm(c).update(regKey).set({
			count: sql`${regKey.count}
	  -
	  ${count}`
		}).where(eq(regKey.code, code)).run();
	},

	async history(c, params) {
		const { regKeyId } = params;
		return userService.listByRegKeyId(c, regKeyId);
	}
}

export default regKeyService;
