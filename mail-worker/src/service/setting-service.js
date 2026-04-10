import KvConst from '../const/kv-const';
import setting from '../entity/setting';
import orm from '../entity/orm';
import {verifyRecordType} from '../const/entity-const';
import fileUtils from '../utils/file-utils';
import r2Service from './r2-service';
import constant from '../const/constant';
import BizError from '../error/biz-error';
import {t} from '../i18n/i18n'
import verifyRecordService from './verify-record-service';
import auditService from './audit-service';
import { auditConst } from '../entity/audit-log';

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
			return c.get('setting')
		}

		const setting = await c.env.kv.get(KvConst.SETTING, { type: 'json' });

		if (!setting) {
			throw new BizError('数据库未初始化 Database not initialized.');
		}

		let domainList = c.env.domain;

		if (typeof domainList === 'string') {
			try {
				domainList = JSON.parse(domainList)
			} catch (error) {
				throw new BizError(t('notJsonDomain'));
			}
		}

		if (!c.env.domain) {
			throw new BizError(t('noDomainVariable'));
		}

		domainList = domainList.map(item => '@' + item);
		setting.domainList = domainList;


		let linuxdoSwitch = c.env.linuxdo_switch;
		let projectLink = c.env.project_link;

		if (typeof linuxdoSwitch === 'string' && linuxdoSwitch === 'true') {
			linuxdoSwitch = true
		} else if (linuxdoSwitch === true) {
			linuxdoSwitch = true
		} else {
			linuxdoSwitch = false
		}

		console.log(projectLink)

		if (typeof projectLink === 'string' && projectLink === 'false') {
			projectLink = false
		} else if (projectLink === false) {
			projectLink = false
		} else {
			projectLink = true
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
		// 从环境变量读取是否启用队列模式
		if (c.env.queue_enabled !== undefined && c.env.queue_enabled !== null && c.env.queue_enabled !== '') {
			let queueEnabled = c.env.queue_enabled;
			if (typeof queueEnabled === 'string') {
				queueEnabled = queueEnabled.toLowerCase() === 'true' || queueEnabled === '1';
			}
			setting.queueEnabled = queueEnabled ? 1 : 0;
		}

		setting.emailPrefixFilter = setting.emailPrefixFilter.split(",").filter(Boolean);

		c.set?.('setting', setting);
		return setting;
	},

	async get(c, showSiteKey = false) {

		const [settingRow, recordList] = await Promise.all([
			await this.query(c),
			verifyRecordService.selectListByIP(c)
		]);


		if (!showSiteKey) {
			settingRow.siteKey = settingRow.siteKey ? `${settingRow.siteKey.slice(0, 6)}******` : null;
		}

		settingRow.secretKey = settingRow.secretKey ? `${settingRow.secretKey.slice(0, 6)}******` : null;

		Object.keys(settingRow.resendTokens).forEach(key => {
			settingRow.resendTokens[key] = `${settingRow.resendTokens[key].slice(0, 12)}******`;
		});

		Object.keys(settingRow.sesTokens).forEach(key => {
			settingRow.sesTokens[key] = `${settingRow.sesTokens[key].slice(0, 12)}******`;
		});

		settingRow.s3AccessKey = settingRow.s3AccessKey ? `${settingRow.s3AccessKey.slice(0, 12)}******` : null;
		settingRow.s3SecretKey = settingRow.s3SecretKey ? `${settingRow.s3SecretKey.slice(0, 12)}******` : null;
		settingRow.sesAccessKey = settingRow.sesAccessKey ? `${settingRow.sesAccessKey.slice(0, 12)}******` : null;
		settingRow.sesSecretKey = settingRow.sesSecretKey ? `${settingRow.sesSecretKey.slice(0, 12)}******` : null;
		settingRow.hasR2 = !!c.env.r2

		let regVerifyOpen = false
		let addVerifyOpen = false

		recordList.forEach(row => {
			if (row.type === verifyRecordType.REG) {
				regVerifyOpen = row.count >= settingRow.regVerifyCount
			}
			if (row.type === verifyRecordType.ADD) {
				addVerifyOpen = row.count >= settingRow.addVerifyCount
			}
		})

		settingRow.regVerifyOpen = regVerifyOpen
		settingRow.addVerifyOpen = addVerifyOpen

		settingRow.storageType = await r2Service.storageType(c);

		return settingRow;
	},

	async set(c, params, operatorInfo) {
		const settingData = await this.query(c);
		let resendTokens = { ...settingData.resendTokens, ...params.resendTokens };
		Object.keys(resendTokens).forEach(domain => {
			if (!resendTokens[domain]) delete resendTokens[domain];
		});

		let sesTokens = { ...settingData.sesTokens, ...params.sesTokens };
		Object.keys(sesTokens).forEach(domain => {
			if (!sesTokens[domain]) delete sesTokens[domain];
		});

		let sendMethodConfig = { ...settingData.sendMethodConfig, ...params.sendMethodConfig };
		Object.keys(sendMethodConfig).forEach(domain => {
			if (!sendMethodConfig[domain]) delete sendMethodConfig[domain];
		});

		if (Array.isArray(params.emailPrefixFilter)) {
			params.emailPrefixFilter = params.emailPrefixFilter + '';
		}

		params.resendTokens = JSON.stringify(resendTokens);
		params.sesTokens = JSON.stringify(sesTokens);
		params.sendMethodConfig = JSON.stringify(sendMethodConfig);
		await orm(c).update(setting).set({ ...params }).returning().get();
		await this.refresh(c);

		// 审计日志
		await auditService.log(c, {
			userId: operatorInfo.userId,
			userEmail: operatorInfo.userEmail,
			action: auditConst.action.SETTING_UPDATE,
			targetType: auditConst.targetType.SETTING,
			targetDesc: 'System Settings',
			detail: { changedKeys: Object.keys(params) }
		});
	},

	async deleteBackground(c) {

		const { background } = await this.query(c);
		if (!background) return

		if (background.startsWith('http')) {
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c)
			return;
		}

		if (background) {
			await r2Service.delete(c,background)
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c)
		}
	},

	async setBackground(c, params) {

		let { background } = params

		await this.deleteBackground(c);

		if (background && !background.startsWith('http')) {

			const file = fileUtils.base64ToFile(background)

			const arrayBuffer = await file.arrayBuffer();
			background = constant.BACKGROUND_PREFIX + await fileUtils.getBuffHash(arrayBuffer) + fileUtils.getExtFileName(file.name);


			await r2Service.putObj(c, background, arrayBuffer, {
				contentType: file.type,
				cacheControl: `public, max-age=31536000, immutable`,
				contentDisposition: `inline; filename="${file.name}"`
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
			projectLink: settingRow.projectLink
		};
	}
};

export default settingService;
