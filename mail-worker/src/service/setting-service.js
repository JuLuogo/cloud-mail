import KvConst from '../const/kv-const';
import setting from '../entity/setting';
import orm from '../entity/orm';
import { verifyRecordType } from '../const/entity-const';
import fileUtils from '../utils/file-utils';
import r2Service from './r2-service';
import constant from '../const/constant';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import verifyRecordService from './verify-record-service';
import auditService from './audit-service';
import { auditConst } from '../entity/audit-log';
import { filterRule } from '../entity/filter-rule';
import { forwardRule } from '../entity/forward-rule';
import { email } from '../entity/email';
import { att } from '../entity/att';
import { isDel } from '../const/entity-const';
import { lt, eq, and, inArray, sql, sum, count } from 'drizzle-orm';

const settingService = {
	async refresh(c) {
		const settingRow = await orm(c).select().from(setting).get();
		settingRow.resendTokens = JSON.parse(settingRow.resendTokens);
		settingRow.sesTokens = JSON.parse(settingRow.sesTokens);
		settingRow.sendMethodConfig = JSON.parse(settingRow.sendMethodConfig);
		c.set('setting', settingRow);
		await c.env.kv.put(KvConst.SETTING, JSON.stringify(settingRow));
	},

	async query(c) {
		if (c.get?.('setting')) {
			return c.get('setting');
		}

		const setting = await c.env.kv.get(KvConst.SETTING, { type: 'json' });

		if (!setting) {
			throw new BizError('数据库未初始化 Database not initialized.');
		}

		let domainList = c.env.domain;

		if (typeof domainList === 'string') {
			try {
				domainList = JSON.parse(domainList);
			} catch (error) {
				throw new BizError(t('notJsonDomain'));
			}
		}

		if (!c.env.domain) {
			throw new BizError(t('noDomainVariable'));
		}

		domainList = domainList.map((item) => '@' + item);
		setting.domainList = domainList;

		let linuxdoSwitch = c.env.linuxdo_switch;
		let projectLink = c.env.project_link;

		if (typeof linuxdoSwitch === 'string' && linuxdoSwitch === 'true') {
			linuxdoSwitch = true;
		} else if (linuxdoSwitch === true) {
			linuxdoSwitch = true;
		} else {
			linuxdoSwitch = false;
		}

		if (typeof projectLink === 'string' && projectLink === 'false') {
			projectLink = false;
		} else if (projectLink === false) {
			projectLink = false;
		} else {
			projectLink = true;
		}

		setting.projectLink = projectLink;

		setting.linuxdoClientId = c.env.linuxdo_client_id;
		setting.linuxdoCallbackUrl = c.env.linuxdo_callback_url;
		setting.linuxdoSwitch = linuxdoSwitch;

		// 从环境变量读取 SES 配置（如果有）
		if (c.env.ses_access_key) {
			setting.sesAccessKey = c.env.ses_access_key;
		}
		if (c.env.ses_secret_key) {
			setting.sesSecretKey = c.env.ses_secret_key;
		}
		if (c.env.ses_region) {
			setting.sesRegion = c.env.ses_region;
		}
		if (c.env.ses_enabled !== undefined && c.env.ses_enabled !== null && c.env.ses_enabled !== '') {
			let sesEnabled = c.env.ses_enabled;
			if (typeof sesEnabled === 'string') {
				// 明确判断是否为 true 或 1，避免 "0"、"false" 等字符串被误判
				sesEnabled = sesEnabled.toLowerCase() === 'true' || sesEnabled === '1';
			}
			setting.sesEnabled = sesEnabled ? 1 : 0;
		}
		// 从环境变量读取本地 SES API URL（用于通过本地 Docker 服务发送邮件）
		if (c.env.local_ses_api_url) {
			setting.localSesApiUrl = c.env.local_ses_api_url;
		}
		// 从环境变量读取本地 SES API 密钥
		if (c.env.local_ses_api_key) {
			setting.localSesApiKey = c.env.local_ses_api_key;
		}
		// 从环境变量读取是否启用队列模式（默认开启）
		// queue_enabled 为空或未设置时，默认启用队列
		if (c.env.queue_enabled === undefined || c.env.queue_enabled === null || c.env.queue_enabled === '') {
			setting.queueEnabled = 1; // 默认开启
		} else {
			let queueEnabled = c.env.queue_enabled;
			if (typeof queueEnabled === 'string') {
				queueEnabled = queueEnabled.toLowerCase() === 'true' || queueEnabled === '1';
			}
			setting.queueEnabled = queueEnabled ? 1 : 0;
		}

		setting.emailPrefixFilter = setting.emailPrefixFilter.split(',').filter(Boolean);

		c.set?.('setting', setting);
		return setting;
	},

	async get(c, showSiteKey = false) {
		const [settingRow, recordList] = await Promise.all([this.query(c), verifyRecordService.selectListByIP(c)]);

		if (!showSiteKey) {
			settingRow.siteKey = settingRow.siteKey ? `${settingRow.siteKey.slice(0, 6)}******` : null;
		}

		settingRow.secretKey = settingRow.secretKey ? `${settingRow.secretKey.slice(0, 6)}******` : null;

		Object.keys(settingRow.resendTokens).forEach((key) => {
			settingRow.resendTokens[key] = `${settingRow.resendTokens[key].slice(0, 12)}******`;
		});

		Object.keys(settingRow.sesTokens).forEach((key) => {
			settingRow.sesTokens[key] = `${settingRow.sesTokens[key].slice(0, 12)}******`;
		});

		settingRow.s3AccessKey = settingRow.s3AccessKey ? `${settingRow.s3AccessKey.slice(0, 12)}******` : null;
		settingRow.s3SecretKey = settingRow.s3SecretKey ? `${settingRow.s3SecretKey.slice(0, 12)}******` : null;
		settingRow.sesAccessKey = settingRow.sesAccessKey ? `${settingRow.sesAccessKey.slice(0, 12)}******` : null;
		settingRow.sesSecretKey = settingRow.sesSecretKey ? `${settingRow.sesSecretKey.slice(0, 12)}******` : null;
		settingRow.hasR2 = !!c.env.r2;

		let regVerifyOpen = false;
		let addVerifyOpen = false;

		recordList.forEach((row) => {
			if (row.type === verifyRecordType.REG) {
				regVerifyOpen = row.count >= settingRow.regVerifyCount;
			}
			if (row.type === verifyRecordType.ADD) {
				addVerifyOpen = row.count >= settingRow.addVerifyCount;
			}
		});

		settingRow.regVerifyOpen = regVerifyOpen;
		settingRow.addVerifyOpen = addVerifyOpen;

		settingRow.storageType = await r2Service.storageType(c);

		return settingRow;
	},

	async set(c, params, operatorInfo) {
		const settingData = await this.query(c);
		let resendTokens = { ...settingData.resendTokens, ...params.resendTokens };
		Object.keys(resendTokens).forEach((domain) => {
			if (!resendTokens[domain]) delete resendTokens[domain];
		});

		let sesTokens = { ...settingData.sesTokens, ...params.sesTokens };
		Object.keys(sesTokens).forEach((domain) => {
			if (!sesTokens[domain]) delete sesTokens[domain];
		});

		let sendMethodConfig = { ...settingData.sendMethodConfig, ...params.sendMethodConfig };
		Object.keys(sendMethodConfig).forEach((domain) => {
			if (!sendMethodConfig[domain]) delete sendMethodConfig[domain];
		});

		if (Array.isArray(params.emailPrefixFilter)) {
			params.emailPrefixFilter = params.emailPrefixFilter + '';
		}

		params.resendTokens = JSON.stringify(resendTokens);
		params.sesTokens = JSON.stringify(sesTokens);
		params.sendMethodConfig = JSON.stringify(sendMethodConfig);
		await orm(c)
			.update(setting)
			.set({ ...params })
			.returning()
			.get();
		await this.refresh(c);

		// 审计日志
		await auditService.log(c, {
			userId: operatorInfo.userId,
			userEmail: operatorInfo.userEmail,
			action: auditConst.action.SETTING_UPDATE,
			targetType: auditConst.targetType.SETTING,
			targetDesc: 'System Settings',
			detail: { changedKeys: Object.keys(params) },
		});
	},

	async deleteBackground(c) {
		const { background } = await this.query(c);
		if (!background) return;

		if (background.startsWith('http')) {
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c);
			return;
		}

		if (background) {
			await r2Service.delete(c, background);
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c);
		}
	},

	async setBackground(c, params) {
		let { background } = params;

		await this.deleteBackground(c);

		if (background && !background.startsWith('http')) {
			const file = fileUtils.base64ToFile(background);

			const arrayBuffer = await file.arrayBuffer();
			background = constant.BACKGROUND_PREFIX + (await fileUtils.getBuffHash(arrayBuffer)) + fileUtils.getExtFileName(file.name);

			await r2Service.putObj(c, background, arrayBuffer, {
				contentType: file.type,
				cacheControl: `public, max-age=31536000, immutable`,
				contentDisposition: `inline; filename="${file.name}"`,
			});
		}

		await orm(c).update(setting).set({ background }).run();
		await this.refresh(c);
		return background;
	},

	async websiteConfig(c) {
		const settingRow = await this.get(c, true);

		return {
			register: settingRow.register,
			title: settingRow.title,
			manyEmail: settingRow.manyEmail,
			addEmail: settingRow.addEmail,
			autoRefresh: settingRow.autoRefresh,
			addEmailVerify: settingRow.addEmailVerify,
			registerVerify: settingRow.registerVerify,
			send: settingRow.send,
			r2Domain: settingRow.r2Domain,
			siteKey: settingRow.siteKey,
			background: settingRow.background,
			loginOpacity: settingRow.loginOpacity,
			domainList: settingRow.domainList,
			regKey: settingRow.regKey,
			regVerifyOpen: settingRow.regVerifyOpen,
			addVerifyOpen: settingRow.addVerifyOpen,
			noticeTitle: settingRow.noticeTitle,
			noticeContent: settingRow.noticeContent,
			noticeType: settingRow.noticeType,
			noticeDuration: settingRow.noticeDuration,
			noticePosition: settingRow.noticePosition,
			noticeWidth: settingRow.noticeWidth,
			noticeOffset: settingRow.noticeOffset,
			notice: settingRow.notice,
			loginDomain: settingRow.loginDomain,
			linuxdoClientId: settingRow.linuxdoClientId,
			linuxdoCallbackUrl: settingRow.linuxdoCallbackUrl,
			linuxdoSwitch: settingRow.linuxdoSwitch,
			minEmailPrefix: settingRow.minEmailPrefix,
			projectLink: settingRow.projectLink,
		};
	},

	async cleanupTempFiles(c, operatorInfo, isScheduled = false) {
		const { tempFileCleanEnabled, tempFileCleanDays } = await this.query(c);

		if (isScheduled && !tempFileCleanEnabled) {
			return { cleaned: 0, message: 'Auto cleanup is disabled' };
		}

		let queueCleaned = 0;
		let attCleaned = 0;
		let orphanedCleaned = 0;
		let totalSize = 0;

		// 1. 清理队列临时文件 (email-queue-att/)
		const queuePrefix = constant.EMAIL_QUEUE_ATT_PREFIX;
		const queueObjects = await r2Service.listObjects(c, queuePrefix);

		if (queueObjects.length > 0) {
			const now = Date.now();
			const expireTime = tempFileCleanDays * 24 * 60 * 60 * 1000;
			const queueExpireDate = new Date(now - expireTime);

			const toDelete = [];

			for (const obj of queueObjects) {
				const uploaded = obj.uploaded || obj.LastModified;
				if (uploaded && new Date(uploaded) < queueExpireDate) {
					toDelete.push(obj.key);
					totalSize += obj.size || 0;
				}
			}

			if (toDelete.length > 0) {
				const batchSize = 1000;
				for (let i = 0; i < toDelete.length; i += batchSize) {
					const batch = toDelete.slice(i, i + batchSize);
					await r2Service.delete(c, batch);
				}
				queueCleaned = toDelete.length;
			}
		}

		// 2. 清理已删除邮件的附件
		const expireDate = new Date();
		expireDate.setDate(expireDate.getDate() - tempFileCleanDays);
		const expireDateStr = expireDate.toISOString().slice(0, 19).replace('T', ' ');

		// 查找已删除且超过清理天数的邮件ID
		const deletedEmails = await orm(c)
			.select({ emailId: email.emailId })
			.from(email)
			.where(and(eq(email.isDel, isDel.DELETE), lt(email.createTime, expireDateStr)))
			.all();

		if (deletedEmails.length > 0) {
			const emailIds = deletedEmails.map((e) => e.emailId);

			// 统计要删除的附件大小
			const attStats = await orm(c)
				.select({ attSize: sum(att.size), attCount: count(att.attId) })
				.from(att)
				.where(inArray(att.emailId, emailIds))
				.get();

			totalSize += Number(attStats?.attSize) || 0;
			attCleaned = attStats?.attCount || 0;

			// 删除附件：先查出仅被这些邮件引用的附件key，再从存储中删除，最后删数据库记录
			// 使用与 att-service.removeAttByField 相同的逻辑：只删除引用计数为1的key的存储文件
			const sqlList = [];
			for (const emailId of emailIds) {
				sqlList.push(
					c.env.db
						.prepare(
							`SELECT a.key, a.att_id
							FROM attachments a
							JOIN (SELECT key FROM attachments GROUP BY key HAVING COUNT(*) = 1) t
							ON a.key = t.key
							WHERE a.email_id = ?;`,
						)
						.bind(emailId),
				);
				sqlList.push(c.env.db.prepare(`DELETE FROM attachments WHERE email_id = ?`).bind(emailId));
			}

			const attListResult = await c.env.db.batch(sqlList);
			const delKeyList = attListResult.flatMap((r) => (r.results ? r.results.map((row) => row.key) : []));

			if (delKeyList.length > 0) {
				const BATCH_SIZE = 1000;
				for (let i = 0; i < delKeyList.length; i += BATCH_SIZE) {
					const batch = delKeyList.slice(i, i + BATCH_SIZE);
					await r2Service.delete(c, batch);
				}
			}

			// 物理删除邮件记录
			await orm(c).delete(email).where(inArray(email.emailId, emailIds)).run();
		}

		// 3. 清理孤立的 attachments/ 文件（存储中存在但数据库中无记录）
		const attPrefix = constant.ATTACHMENT_PREFIX;
		const storageObjects = await r2Service.listObjects(c, attPrefix);

		if (storageObjects.length > 0) {
			const dbKeysResult = await orm(c).selectDistinct({ key: att.key }).from(att).all();
			const dbKeys = new Set(dbKeysResult.map((r) => r.key));

			const orphanedKeys = [];
			for (const obj of storageObjects) {
				if (!dbKeys.has(obj.key)) {
					orphanedKeys.push(obj.key);
					totalSize += obj.size || 0;
				}
			}

			if (orphanedKeys.length > 0) {
				const BATCH_SIZE = 1000;
				for (let i = 0; i < orphanedKeys.length; i += BATCH_SIZE) {
					const batch = orphanedKeys.slice(i, i + BATCH_SIZE);
					await r2Service.delete(c, batch);
				}
				orphanedCleaned = orphanedKeys.length;
			}
		}

		const totalCleaned = queueCleaned + attCleaned + orphanedCleaned;

		if (totalCleaned === 0) {
			return { cleaned: 0, message: 'No expired files found' };
		}

		// Audit log
		await auditService.log(c, {
			userId: operatorInfo.userId,
			userEmail: operatorInfo.userEmail,
			action: 'temp_file_cleanup',
			targetType: 'system',
			targetDesc: 'Temp File Cleanup',
			detail: { queueCleaned, attCleaned, orphanedCleaned, deletedEmails: deletedEmails?.length || 0, totalSize },
		});

		return {
			cleaned: totalCleaned,
			queueCleaned,
			attCleaned,
			orphanedCleaned,
			deletedEmails: deletedEmails?.length || 0,
			totalSize,
			message: `Cleaned ${queueCleaned} queue files, ${attCleaned} attachments from ${deletedEmails?.length || 0} deleted emails, ${orphanedCleaned} orphaned files`,
		};
	},

	async getTempFileStats(c) {
		const storageType = await r2Service.storageType(c);
		const { tempFileCleanDays } = await this.query(c);

		// 1. 统计队列临时文件 (email-queue-att/)
		const queuePrefix = constant.EMAIL_QUEUE_ATT_PREFIX;
		const queueObjects = await r2Service.listObjects(c, queuePrefix);

		let queueFileSize = 0;
		for (const obj of queueObjects) {
			queueFileSize += obj.size || 0;
		}

		// 2. 统计已删除邮件的附件
		const expireDate = new Date();
		expireDate.setDate(expireDate.getDate() - tempFileCleanDays);
		const expireDateStr = expireDate.toISOString().slice(0, 19).replace('T', ' ');

		const deletedEmailAtts = await orm(c)
			.select({
				attCount: count(att.attId),
				attSize: sum(att.size),
			})
			.from(att)
			.innerJoin(email, eq(att.emailId, email.emailId))
			.where(and(eq(email.isDel, isDel.DELETE), lt(email.createTime, expireDateStr)))
			.get();

		const deletedAttCount = deletedEmailAtts?.attCount || 0;
		const deletedAttSize = Number(deletedEmailAtts?.attSize) || 0;

		// 3. 扫描 attachments/ 前缀，找出孤立文件（存储中存在但数据库中无记录）
		const attPrefix = constant.ATTACHMENT_PREFIX;
		const storageObjects = await r2Service.listObjects(c, attPrefix);

		let orphanedCount = 0;
		let orphanedSize = 0;

		if (storageObjects.length > 0) {
			// 从数据库获取所有正在使用的 attachment key
			const dbKeysResult = await orm(c).selectDistinct({ key: att.key }).from(att).all();
			const dbKeys = new Set(dbKeysResult.map((r) => r.key));

			for (const obj of storageObjects) {
				if (!dbKeys.has(obj.key)) {
					orphanedCount++;
					orphanedSize += obj.size || 0;
				}
			}
		}

		return {
			storageType,
			count: queueObjects.length + deletedAttCount + orphanedCount,
			totalSize: queueFileSize + deletedAttSize + orphanedSize,
			queueTempFiles: queueObjects.length,
			deletedEmailAtts: deletedAttCount,
			orphanedFiles: orphanedCount,
		};
	},

	async cleanupRules(c, operatorInfo, isScheduled = false) {
		const { ruleCleanEnabled, ruleCleanDays } = await this.query(c);

		if (isScheduled && !ruleCleanEnabled) {
			return { cleaned: 0, filterCleaned: 0, forwardCleaned: 0, message: 'Auto rule cleanup is disabled' };
		}

		const expireDate = new Date();
		expireDate.setDate(expireDate.getDate() - ruleCleanDays);
		const expireDateStr = expireDate.toISOString().slice(0, 19).replace('T', ' ');

		// 清理过期的过滤规则（软删除超过指定天数的）
		const filterResult = await orm(c)
			.delete(filterRule)
			.where(and(eq(filterRule.isDel, 1), lt(filterRule.createTime, expireDateStr)))
			.run();

		// 清理过期的转发规则（软删除超过指定天数的）
		const forwardResult = await orm(c)
			.delete(forwardRule)
			.where(and(eq(forwardRule.isDel, 1), lt(forwardRule.createTime, expireDateStr)))
			.run();

		const filterCleaned = filterResult.meta?.changes || 0;
		const forwardCleaned = forwardResult.meta?.changes || 0;
		const totalCleaned = filterCleaned + forwardCleaned;

		// 审计日志
		await auditService.log(c, {
			userId: operatorInfo.userId,
			userEmail: operatorInfo.userEmail,
			action: 'rule_cleanup',
			targetType: 'system',
			targetDesc: 'Rule Cleanup',
			detail: { filterCleaned, forwardCleaned },
		});

		return {
			cleaned: totalCleaned,
			filterCleaned,
			forwardCleaned,
			message: `Cleaned ${filterCleaned} filter rules and ${forwardCleaned} forward rules`,
		};
	},

	async getRuleStats(c) {
		const { ruleCleanDays } = await this.query(c);
		const expireDate = new Date();
		expireDate.setDate(expireDate.getDate() - ruleCleanDays);
		const expireDateStr = expireDate.toISOString().slice(0, 19).replace('T', ' ');

		// 统计已软删除超过指定天数的规则数量
		const expiredFilterRules = await orm(c)
			.select()
			.from(filterRule)
			.where(and(eq(filterRule.isDel, 1), lt(filterRule.createTime, expireDateStr)))
			.all();

		const expiredForwardRules = await orm(c)
			.select()
			.from(forwardRule)
			.where(and(eq(forwardRule.isDel, 1), lt(forwardRule.createTime, expireDateStr)))
			.all();

		return {
			expiredFilterRules: expiredFilterRules.length,
			expiredForwardRules: expiredForwardRules.length,
			totalExpired: expiredFilterRules.length + expiredForwardRules.length,
		};
	},
};

export default settingService;
