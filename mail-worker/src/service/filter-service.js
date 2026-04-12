import orm from '../entity/orm';
import { filterRule } from '../entity/filter-rule';
import { and, eq, desc, asc } from 'drizzle-orm';
import { t } from '../i18n/i18n';
import BizError from '../error/biz-error';

// 允许的过滤字段白名单
const ALLOWED_FIELDS = ['subject', 'sendEmail', 'toEmail', 'name', 'text', 'content'];
const ALLOWED_OPERATORS = ['contains', 'equals', 'startsWith', 'endsWith'];

const filterService = {

	async list(c, userId) {
		return orm(c).select().from(filterRule)
			.where(and(eq(filterRule.userId, userId), eq(filterRule.isDel, 0)))
			.orderBy(desc(filterRule.priority)).all();
	},

	async add(c, params, userId) {
		const { name, field, operator, value, action, actionTarget, priority } = params;

		if (!name || !field || !operator || !value || action === undefined) {
			throw new BizError(t('filterRuleInvalid'));
		}

		if (!ALLOWED_FIELDS.includes(field)) {
			throw new BizError(t('filterRuleInvalid'));
		}

		if (!ALLOWED_OPERATORS.includes(operator)) {
			throw new BizError(t('filterRuleInvalid'));
		}

		await orm(c).insert(filterRule).values({
			userId,
			name,
			field,
			operator,
			value,
			action,
			actionTarget,
			priority: priority || 0
		}).run();
	},

	async update(c, params, userId) {
		const { ruleId, name, field, operator, value, action, actionTarget, priority, status } = params;

		if (field && !ALLOWED_FIELDS.includes(field)) {
			throw new BizError(t('filterRuleInvalid'));
		}

		if (operator && !ALLOWED_OPERATORS.includes(operator)) {
			throw new BizError(t('filterRuleInvalid'));
		}

		const rule = await orm(c).select().from(filterRule)
			.where(and(eq(filterRule.ruleId, ruleId), eq(filterRule.userId, userId)))
			.get();

		if (!rule) {
			throw new BizError(t('filterRuleNotExist'));
		}

		await orm(c).update(filterRule).set({
			name: name || rule.name,
			field: field || rule.field,
			operator: operator || rule.operator,
			value: value || rule.value,
			action: action !== undefined ? action : rule.action,
			actionTarget: actionTarget !== undefined ? actionTarget : rule.actionTarget,
			priority: priority !== undefined ? priority : rule.priority,
			status: status !== undefined ? status : rule.status
		}).where(and(eq(filterRule.ruleId, ruleId), eq(filterRule.userId, userId))).run();
	},

	async delete(c, params, userId) {
		const { ruleId } = params;

		await orm(c).update(filterRule).set({ isDel: 1 })
			.where(and(eq(filterRule.ruleId, ruleId), eq(filterRule.userId, userId))).run();
	},

	async toggle(c, params, userId) {
		const { ruleId, status } = params;

		await orm(c).update(filterRule).set({ status })
			.where(and(eq(filterRule.ruleId, ruleId), eq(filterRule.userId, userId))).run();
	},

	matchRule(emailData, rule) {
		const fieldValue = emailData[rule.field] || '';
		const matchValue = rule.value;

		switch (rule.operator) {
			case 'contains':
				return fieldValue.toLowerCase().includes(matchValue.toLowerCase());
			case 'equals':
				return fieldValue.toLowerCase() === matchValue.toLowerCase();
			case 'startsWith':
				return fieldValue.toLowerCase().startsWith(matchValue.toLowerCase());
			case 'endsWith':
				return fieldValue.toLowerCase().endsWith(matchValue.toLowerCase());
			default:
				return false;
		}
	}
};

export default filterService;
