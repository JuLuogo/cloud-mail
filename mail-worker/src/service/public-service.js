import BizError from '../error/biz-error';
import orm from '../entity/orm';
import { v4 as uuidv4 } from 'uuid';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import saltHashUtils from '../utils/crypto-utils';
import cryptoUtils from '../utils/crypto-utils';
import emailUtils from '../utils/email-utils';
import roleService from './role-service';
import verifyUtils from '../utils/verify-utils';
import { t } from '../i18n/i18n';
import reqUtils from '../utils/req-utils';
import dayjs from 'dayjs';
import { isDel, roleConst } from '../const/entity-const';
import email from '../entity/email';
import userService from './user-service';
import KvConst from '../const/kv-const';
import user from '../entity/user';
import account from '../entity/account';

const publicService = {

	async emailList(c, params) {

		let { toEmail, content, subject, sendName, sendEmail, timeSort, num, size, type , isDel, domain } = params

		// 公共接口必须指定域名进行过滤，防止枚举全库邮件
		if (!domain || !c.env.domain.includes(domain)) {
			throw new BizError('必须提供有效的域名参数进行查询');
		}

		// 限制返回字段，不包含 content 和 text（防止敏感内容泄露）
		const query = orm(c).select({
				emailId: email.emailId,
				sendEmail: email.sendEmail,
				sendName: email.name,
				subject: email.subject,
				toEmail: email.toEmail,
				toName: email.toName,
				type: email.type,
				createTime: email.createTime,
				isDel: email.isDel,
		}).from(email)

		if (!size) {
			size = 20
		}

		if (!num) {
			num = 1
		}

		size = Number(size);
		num = Number(num);

		// 限制最大返回数量，防止滥用
		if (size > 50) {
			size = 50;
		}

		num = (num - 1) * size;

		let conditions = []

		// 强制添加域名过滤条件，只允许查询属于配置域名的邮件
		const domainCondition = sql`(${email.sendEmail} LIKE ${'%@' + domain} OR ${email.toEmail} LIKE ${'%@' + domain})`;
		conditions.push(domainCondition);

		if (toEmail) {
			conditions.push(sql`${email.toEmail} COLLATE NOCASE LIKE ${toEmail}`)
		}

		if (sendEmail) {
			conditions.push(sql`${email.sendEmail} COLLATE NOCASE LIKE ${sendEmail}`)
		}

		if (sendName) {
			conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${sendName}`)
		}

		if (subject) {
			conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${subject}`)
		}

		// 不再支持 content 全文搜索（该字段可能包含敏感内容）
		// 如果需要搜索邮件内容，应该通过用户认证后的 API 访问

		if (type || type === 0) {
			conditions.push(eq(email.type, type))
		}

		if (isDel || isDel === 0) {
			conditions.push(eq(email.isDel, isDel))
		}

		if (conditions.length === 1) {
			query.where(...conditions)
		} else if (conditions.length > 1) {
			query.where(and(...conditions))
		}

		if (timeSort === 'asc') {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		return query.limit(size).offset(num);

	},

	async addUser(c, params) {
		const { list } = params;

		if (list.length === 0) return;

		for (const emailRow of list) {
			if (!verifyUtils.isEmail(emailRow.email)) {
				throw new BizError(t('notEmail'));
			}

			if (!c.env.domain.includes(emailUtils.getDomain(emailRow.email))) {
				throw new BizError(t('notEmailDomain'));
			}

			const { salt, hash } = await saltHashUtils.hashPassword(
				emailRow.password || cryptoUtils.genRandomPwd()
			);

			emailRow.salt = salt;
			emailRow.hash = hash;
		}


		const activeIp = reqUtils.getIp(c);
		const { os, browser, device } = reqUtils.getUserAgent(c);
		const activeTime = dayjs().format('YYYY-MM-DD HH:mm:ss');

		const roleList = await roleService.roleSelectUse(c);
		const defRole = roleList.find(roleRow => roleRow.isDefault === roleConst.isDefault.OPEN);

		const userList = [];

		for (const emailRow of list) {
			let { email, hash, salt, roleName } = emailRow;
			let type = defRole.roleId;

			if (roleName) {
				const roleRow = roleList.find(role => role.name === roleName);
				type = roleRow ? roleRow.roleId : type;
			}

			userList.push({
				email,
				password: hash,
				salt,
				type,
				os,
				browser,
				activeIp,
				createIp: activeIp,
				device,
				activeTime,
				createTime: activeTime
			});
		}

		try {
			// 使用 Drizzle ORM 批量插入，避免 SQL 注入
			await orm(c).insert(user).values(userList).run();

			// 更新 account 表，关联用户 ID
			await c.env.db.prepare(`UPDATE account SET user_id = (SELECT user_id FROM user WHERE user.email = account.email) WHERE user_id = 0;`).run();
		} catch (e) {
			if(e.message.includes('SQLITE_CONSTRAINT')) {
				throw new BizError(t('emailExistDatabase'))
			} else {
				throw e
			}
		}

	},

	async genToken(c, params) {

		await this.verifyUser(c, params)

		const uuid = uuidv4();

		// Token 设置 24 小时过期，防止长期滥用
		await c.env.kv.put(KvConst.PUBLIC_KEY, uuid, { expirationTtl: 60 * 60 * 24 });

		return {token: uuid}
	},

	async verifyUser(c, params) {

		const { email, password } = params

		// 先检查是否为管理员，避免不必要的数据库查询，并使用统一错误信息防止邮箱枚举
		if (email !== c.env.admin) {
			throw new BizError(t('IncorrectPwd'));
		}

		const userRow = await userService.selectForAuth(c, email);

		if (!userRow || userRow.isDel === isDel.DELETE) {
			throw new BizError(t('IncorrectPwd'));
		}

		if (!await cryptoUtils.verifyPassword(password, userRow.salt, userRow.password)) {
			throw new BizError(t('IncorrectPwd'));
		}
	}

}

export default publicService
