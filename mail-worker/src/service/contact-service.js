import orm from '../entity/orm';
import { contact, contactGroup } from '../entity/contact';
import { and, eq, desc, asc, count, like, or, sql } from 'drizzle-orm';
import { t } from '../i18n/i18n';
import BizError from '../error/biz-error';

const contactService = {

	async list(c, params, userId) {
		let { groupId, keyword, size, num, isStar } = params;
		size = Number(size) || 20;
		num = Number(num) || 1;

		// 转换字符串 'null' 为真正的 null
		if (groupId === 'null' || groupId === '') {
			groupId = null;
		} else {
			groupId = Number(groupId);
		}

		// 转换字符串 '0' 为 0
		isStar = Number(isStar) || 0;

		const conditions = [eq(contact.userId, userId), eq(contact.isDel, 0)];

		if (groupId) {
			conditions.push(eq(contact.groupId, groupId));
		}

		if (keyword) {
			conditions.push(
				or(
					like(contact.name, `%${keyword}%`),
					like(contact.email, `%${keyword}%`),
					like(contact.company, `%${keyword}%`)
				)
			);
		}

		if (isStar) {
			conditions.push(eq(contact.isStar, 1));
		}

		const offset = (num - 1) * size;

		const list = await orm(c).select().from(contact)
			.where(and(...conditions))
			.orderBy(desc(contact.isStar), desc(contact.sendCount))
			.limit(size).offset(offset).all();

		const [{ total }] = await orm(c).select({ total: count() })
			.from(contact).where(and(...conditions)).all();

		return { list, total };
	},

	async add(c, params, userId) {
		const { email, name } = params;

		const exist = await orm(c).select().from(contact)
			.where(and(eq(contact.email, email), eq(contact.userId, userId), eq(contact.isDel, 0)))
			.get();

		if (exist) {
			throw new BizError(t('contactAlreadyExist'));
		}

		await orm(c).insert(contact).values({ ...params, userId }).run();
	},

	async update(c, params, userId) {
		const { contactId, ...updateData } = params;
		updateData.updateTime = new Date().toISOString();

		await orm(c).update(contact).set(updateData)
			.where(and(eq(contact.contactId, contactId), eq(contact.userId, userId)))
			.run();
	},

	async delete(c, params, userId) {
		const { contactId } = params;
		await orm(c).update(contact).set({ isDel: 1 })
			.where(and(eq(contact.contactId, contactId), eq(contact.userId, userId)))
			.run();
	},

	async toggleStar(c, params, userId) {
		const { contactId, isStar } = params;
		await orm(c).update(contact).set({ isStar })
			.where(and(eq(contact.contactId, contactId), eq(contact.userId, userId)))
			.run();
	},

	async groupList(c, userId) {
		return orm(c).select().from(contactGroup)
			.where(and(eq(contactGroup.userId, userId), eq(contactGroup.isDel, 0)))
			.orderBy(asc(contactGroup.sort)).all();
	},

	async groupAdd(c, params, userId) {
		await orm(c).insert(contactGroup).values({ ...params, userId }).run();
	},

	async groupUpdate(c, params, userId) {
		const { groupId, ...updateData } = params;
		await orm(c).update(contactGroup).set(updateData)
			.where(and(eq(contactGroup.groupId, groupId), eq(contactGroup.userId, userId)))
			.run();
	},

	async groupDelete(c, params, userId) {
		const { groupId } = params;
		await orm(c).update(contact).set({ groupId: null })
			.where(and(eq(contact.groupId, groupId), eq(contact.userId, userId)))
			.run();
		await orm(c).update(contactGroup).set({ isDel: 1 })
			.where(and(eq(contactGroup.groupId, groupId), eq(contactGroup.userId, userId)))
			.run();
	},

	async incrementSendCount(c, emailAddr, userId) {
		await orm(c).update(contact).set({
			sendCount: sql`${contact.sendCount} + 1`,
			lastSendTime: new Date().toISOString()
		}).where(and(eq(contact.email, emailAddr), eq(contact.userId, userId))).run();
	}
};

export default contactService;
