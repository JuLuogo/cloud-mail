import orm from '../entity/orm';
import { auditLog } from '../entity/audit-log';
import { and, eq, desc, count, like, lte, gte } from 'drizzle-orm';
import reqUtils from '../utils/req-utils';

const auditService = {
	async log(c, params) {
		const { userId, userEmail, action, targetType, targetId, targetDesc, detail } = params;
		const ip = c.req ? reqUtils.getIp(c) : null;
		const userAgent = c.req?.header('user-agent') || null;

		await orm(c)
			.insert(auditLog)
			.values({
				userId,
				userEmail,
				action,
				targetType,
				targetId: targetId ? String(targetId) : null,
				targetDesc,
				detail: detail ? JSON.stringify(detail) : null,
				ip,
				userAgent,
			})
			.run();
	},

	async list(c, params) {
		let { num, size, action, targetType, startTime, endTime, userEmail } = params;
		size = Number(size) || 20;
		num = Number(num) || 1;

		const conditions = [];

		if (action) {
			conditions.push(eq(auditLog.action, action));
		}

		if (targetType) {
			conditions.push(eq(auditLog.targetType, targetType));
		}

		if (userEmail) {
			conditions.push(like(auditLog.userEmail, `%${userEmail}%`));
		}

		if (startTime && endTime) {
			conditions.push(gte(auditLog.createTime, startTime));
			conditions.push(lte(auditLog.createTime, endTime));
		}

		const offset = (num - 1) * size;

		let listQuery = orm(c).select().from(auditLog);
		let totalQuery;

		if (conditions.length > 0) {
			listQuery = listQuery.where(and(...conditions));
			totalQuery = orm(c)
				.select({ total: count() })
				.from(auditLog)
				.where(and(...conditions));
		} else {
			totalQuery = orm(c).select({ total: count() }).from(auditLog);
		}

		const list = await listQuery.orderBy(desc(auditLog.logId)).limit(size).offset(offset).all();

		const [{ total }] = await totalQuery.all();

		return { list, total };
	},

	async detail(c, params) {
		const { logId } = params;
		return orm(c).select().from(auditLog).where(eq(auditLog.logId, logId)).get();
	},
};

export default auditService;
