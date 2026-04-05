import orm from '../entity/orm';
import { forwardRule } from '../entity/forward-rule';
import user from '../entity/user';
import { account } from '../entity/account';
import { and, eq, desc, inArray } from 'drizzle-orm';
import { t } from '../i18n/i18n';
import BizError from '../error/biz-error';
import emailUtils from '../utils/email-utils';
import roleService from './role-service';
import { isDel } from '../const/entity-const';

const forwardRuleService = {

	/**
	 * 获取用户的可用域名（优先使用用户个人设置，其次使用角色设置）
	 */
	async getUserAvailDomain(c, userId) {
		if (userId === 0) {
			return ''; // 管理员有全部权限
		}
		const userRow = await orm(c).select({ availDomain: user.availDomain }).from(user).where(eq(user.userId, userId)).get();
		// 如果用户没有设置个人可用域名（空字符串），使用角色设置
		if (!userRow?.availDomain) {
			const { availDomain } = await roleService.selectByUserId(c, userId);
			return availDomain;
		}
		return userRow.availDomain;
	},

	/**
	 * 列出用户的转发规则
	 * 管理员(userId=0)可查看所有全局规则，普通用户只看自己的
	 */
	async list(c, userId) {
		const conditions = userId === 0
			? [eq(forwardRule.isDel, 0)]
			: [eq(forwardRule.isDel, 0), eq(forwardRule.userId, userId)];

		return orm(c).select().from(forwardRule)
			.where(and(...conditions))
			.orderBy(desc(forwardRule.priority), desc(forwardRule.ruleId))
			.all();
	},

	/**
	 * 添加转发规则
	 */
	async add(c, params, userId) {
		const { pattern, forwardTo, description, priority } = params;

		if (!pattern || !forwardTo) {
			throw new BizError(t('forwardRuleParamInvalid'));
		}

		if (!emailUtils.isEmail(forwardTo)) {
			throw new BizError(t('forwardToEmailInvalid'));
		}

		if (!pattern.includes('@') || !pattern.includes('*')) {
			throw new BizError(t('forwardPatternMustContainWildcard'));
		}

		const patternDomain = emailUtils.getDomain(pattern);
		if (!patternDomain || patternDomain.includes('*')) {
			throw new BizError(t('forwardPatternDomainInvalid'));
		}

		// 非管理员用户需要验证转发目标必须是自己的邮箱
		if (userId !== 0) {
			const userAccounts = await orm(c).select({ email: account.email }).from(account).where(and(eq(account.userId, userId), eq(account.isDel, isDel.NORMAL))).all();
			const userEmails = userAccounts.map(a => a.email.toLowerCase());
			if (!userEmails.includes(forwardTo.toLowerCase())) {
				throw new BizError(t('forwardToMustBeOwnEmail'));
			}
		}

		// 非管理员用户需要验证域名权限
		if (userId !== 0) {
			const availDomain = await this.getUserAvailDomain(c, userId);
			if (!roleService.hasAvailDomainPerm(availDomain, pattern)) {
				throw new BizError(t('noDomainPermAdd'));
			}
		}

		await orm(c).insert(forwardRule).values({
			userId,
			pattern,
			forwardTo,
			description: description || '',
			priority: priority || 0,
			status: 1
		}).run();
	},

	/**
	 * 更新转发规则
	 */
	async update(c, params, userId) {
		const { ruleId, pattern, forwardTo, description, priority, status } = params;

		const rule = await this.getById(c, ruleId);

		if (!rule) {
			throw new BizError(t('filterRuleNotExist'));
		}

		// 权限检查：规则所有者(rule.userId === userId) 或 全局规则(rule.userId === 0) 可以操作
		if (rule.userId !== userId && rule.userId !== 0) {
			throw new BizError(t('noPermission'));
		}

		if (pattern) {
			if (!pattern.includes('@') || !pattern.includes('*')) {
				throw new BizError(t('forwardPatternMustContainWildcard'));
			}
			const patternDomain = emailUtils.getDomain(pattern);
			if (!patternDomain || patternDomain.includes('*')) {
				throw new BizError(t('forwardPatternDomainInvalid'));
			}
			// 非全局规则需要验证域名权限
			if (rule.userId !== 0) {
				const availDomain = await this.getUserAvailDomain(c, rule.userId);
				if (!roleService.hasAvailDomainPerm(availDomain, pattern)) {
					throw new BizError(t('noDomainPermAdd'));
				}
			}
		}

		if (forwardTo && !emailUtils.isEmail(forwardTo)) {
			throw new BizError(t('forwardToEmailInvalid'));
		}

		// 如果更新了转发目标，非管理员用户需要验证转发目标必须是自己的邮箱
		if (forwardTo && rule.userId !== 0) {
			const userAccounts = await orm(c).select({ email: account.email }).from(account).where(and(eq(account.userId, rule.userId), eq(account.isDel, isDel.NORMAL))).all();
			const userEmails = userAccounts.map(a => a.email.toLowerCase());
			if (!userEmails.includes(forwardTo.toLowerCase())) {
				throw new BizError(t('forwardToMustBeOwnEmail'));
			}
		}

		await orm(c).update(forwardRule).set({
			pattern: pattern || rule.pattern,
			forwardTo: forwardTo || rule.forwardTo,
			description: description !== undefined ? description : rule.description,
			priority: priority !== undefined ? priority : rule.priority,
			status: status !== undefined ? status : rule.status
		}).where(eq(forwardRule.ruleId, ruleId)).run();
	},

	/**
	 * 删除转发规则（软删除）
	 */
	async delete(c, params, userId) {
		const { ruleId } = params;

		const rule = await this.getById(c, ruleId);

		if (!rule) {
			throw new BizError(t('filterRuleNotExist'));
		}

		// 权限检查：规则所有者 或 全局规则 可以删除
		if (rule.userId !== userId && rule.userId !== 0) {
			throw new BizError(t('noPermission'));
		}

		await orm(c).update(forwardRule).set({ isDel: 1 })
			.where(eq(forwardRule.ruleId, ruleId)).run();
	},

	/**
	 * 启用/禁用规则
	 */
	async toggle(c, params, userId) {
		const { ruleId, status } = params;

		const rule = await this.getById(c, ruleId);

		if (!rule) {
			throw new BizError(t('filterRuleNotExist'));
		}

		// 权限检查：规则所有者 或 全局规则 可以操作
		if (rule.userId !== userId && rule.userId !== 0) {
			throw new BizError(t('noPermission'));
		}

		await orm(c).update(forwardRule).set({ status })
			.where(eq(forwardRule.ruleId, ruleId)).run();
	},

	/**
	 * 根据ID获取规则
	 */
	getById(c, ruleId) {
		return orm(c).select().from(forwardRule)
			.where(eq(forwardRule.ruleId, ruleId))
			.get();
	},

	/**
	 * 获取所有启用的规则（全局+用户）
	 */
	async getEnabledRules(c) {
		return orm(c).select().from(forwardRule)
			.where(and(
				eq(forwardRule.isDel, 0),
				eq(forwardRule.status, 1)
			))
			.orderBy(desc(forwardRule.priority))
			.all();
	},

	/**
	 * 通配符模式转正则表达式
	 */
	wildcardToRegex(pattern) {
		let regexStr = pattern
			.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
			.replace(/\*/g, '.*');
		return new RegExp(`^${regexStr}$`, 'i');
	},

	/**
	 * 匹配邮箱是否满足通配符模式
	 */
	matchWildcardEmail(email, pattern) {
		if (!pattern || !email) return false;
		try {
			const regex = this.wildcardToRegex(pattern);
			return regex.test(email);
		} catch (e) {
			console.error('通配符匹配错误:', e);
			return false;
		}
	},

	/**
	 * 查找匹配邮件地址的转发规则
	 * @param {string} email - 邮件地址
	 * @returns {Object|null} 匹配的规则
	 */
	async findMatchingRule(c, email) {
		const rules = await this.getEnabledRules(c);

		for (const rule of rules) {
			if (!this.matchWildcardEmail(email, rule.pattern)) {
				continue;
			}

			// 全局规则(userId=0)直接匹配
			if (rule.userId === 0) {
				return rule;
			}

			// 用户规则需要验证域名权限
			const availDomain = await this.getUserAvailDomain(c, rule.userId);
			if (!roleService.hasAvailDomainPerm(availDomain, email)) {
				continue;
			}

			// 检查用户的 forwardStatus 是否开启
			const ruleOwner = await orm(c).select({ forwardStatus: user.forwardStatus }).from(user).where(eq(user.userId, rule.userId)).get();
			if (!ruleOwner || ruleOwner.forwardStatus !== 1) {
				continue;
			}

			return rule;
		}

		return null;
	}
};

export default forwardRuleService;