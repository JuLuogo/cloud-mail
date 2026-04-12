import orm from '../entity/orm';
import email from '../entity/email';
import { att as attEntity } from '../entity/att';
import settingService from './setting-service';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);
import { eq, and } from 'drizzle-orm';
import jwtUtils from '../utils/jwt-utils';
import emailMsgTemplate from '../template/email-msg';
import emailTextTemplate from '../template/email-text';
import emailHtmlTemplate from '../template/email-html';
import verifyUtils from '../utils/verify-utils';
import domainUtils from "../utils/domain-uitls";
import r2Service from './r2-service';
import { attConst } from '../const/entity-const';

const telegramService = {

	async getEmailContent(c, params) {

		const { token } = params

		const result = await jwtUtils.verifyToken(c, token);

		if (!result) {
			return emailTextTemplate('Access denied')
		}

		const emailRow = await orm(c).select().from(email).where(eq(email.emailId, result.emailId)).get();

		if (emailRow) {

			if (emailRow.content) {
				const { r2Domain } = await settingService.query(c);
				return emailHtmlTemplate(emailRow.content || '', r2Domain)
			} else {
				return emailTextTemplate(emailRow.text || '')
			}

		} else {
			return emailTextTemplate('The email does not exist')
		}

	},

	async sendEmailToBot(c, email) {

		const { tgBotToken, tgChatId, customDomain, tgMsgTo, tgMsgFrom, tgMsgText } = await settingService.query(c);

		const tgChatIds = tgChatId.split(',');

		const jwtToken = await jwtUtils.generateToken(c, { emailId: email.emailId })

		const webAppUrl = customDomain ? `${domainUtils.toOssDomain(customDomain)}/api/telegram/getEmail/${jwtToken}` : 'https://www.cloudflare.com/404'

		// 查询邮件附件（普通附件 contentId 为空，内嵌图片 contentId 不为空）
		const attachments = await orm(c).select().from(attEntity).where(
			and(
				eq(attEntity.emailId, email.emailId),
				eq(attEntity.userId, email.userId),
				eq(attEntity.type, attConst.type.ATT)
			)
		).all();

		// 区分普通附件和内嵌图片
		const regularAttachments = attachments.filter(att => !att.contentId);
		const inlineImages = attachments.filter(att => att.contentId);

		// 构建消息文字
		const messageText = emailMsgTemplate(email, tgMsgTo, tgMsgFrom, tgMsgText, regularAttachments, inlineImages);

		await Promise.all(tgChatIds.map(async chatId => {
			try {
				// 合并所有附件：内嵌图片优先，然后是普通附件
				const allAttachments = [...inlineImages, ...regularAttachments];

				if (allAttachments.length > 0) {
					// 使用 sendMediaGroup 发送媒体组（多条图片/文件在一条消息中）
					await this.sendMediaGroup(c, tgBotToken, chatId, allAttachments, messageText, webAppUrl);
				} else {
					// 无附件时，只发送文本消息
					await this.sendTextMessage(tgBotToken, chatId, messageText, webAppUrl);
				}
			} catch (e) {
				console.error(`转发 Telegram 失败:`, e.message);
			}
		}));

	},

	/**
	 * 发送文本消息到 Telegram
	 */
	async sendTextMessage(tgBotToken, chatId, text, webAppUrl) {
		const res = await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				chat_id: chatId,
				parse_mode: 'HTML',
				text,
				reply_markup: {
					inline_keyboard: [
						[
							{
								text: '查看',
								web_app: { url: webAppUrl }
							}
						]
					]
				}
			})
		});
		if (!res.ok) {
			console.error(`转发 Telegram 失败 status: ${res.status} response: ${await res.text()}`);
		}
	},

	/**
	 * 发送媒体组（多张图片/文件 + 文字 caption）在同一条消息中
	 * Telegram 的 sendMediaGroup 最多支持 10 个媒体项目
	 */
	async sendMediaGroup(c, tgBotToken, chatId, attachments, caption, webAppUrl) {
		const MAX_MEDIA_PER_GROUP = 10;

		// 将附件分批，每批最多 10 个
		const batches = [];
		for (let i = 0; i < attachments.length; i += MAX_MEDIA_PER_GROUP) {
			batches.push(attachments.slice(i, i + MAX_MEDIA_PER_GROUP));
		}

		for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
			const batch = batches[batchIndex];
			const isFirstBatch = batchIndex === 0;
			const isLastBatch = batchIndex === batches.length - 1;

			const media = [];

			for (let i = 0; i < batch.length; i++) {
				const att = batch[i];
				const isImage = att.mimeType && att.mimeType.startsWith('image/');
				const inputType = isImage ? 'photo' : 'document';

				const mediaItem = {
					type: inputType,
					media: `attach://${att.key}`,
					caption: isFirstBatch && i === 0 ? caption : undefined,
					parse_mode: 'HTML'
				};

				// 只有第一张图片/文件的 caption 会生效
				if (isFirstBatch && i === 0) {
					mediaItem.caption = caption;
				} else {
					delete mediaItem.caption;
				}

				media.push(mediaItem);
			}

			// 如果不是最后一批，添加查看按钮
			let replyMarkup = undefined;
			if (isLastBatch && webAppUrl) {
				replyMarkup = {
					inline_keyboard: [
						[
							{
								text: '查看',
								web_app: { url: webAppUrl }
							}
						]
					]
				};
			}

			const formData = new FormData();
			formData.append('chat_id', chatId);
			formData.append('media', JSON.stringify(media));

			if (replyMarkup) {
				formData.append('reply_markup', JSON.stringify(replyMarkup));
			}

			// 添加附件文件
			for (const att of batch) {
				const attachmentBuffer = await r2Service.getObj(c, att.key);
				if (!attachmentBuffer) {
					console.error(`附件不存在: ${att.key}`);
					continue;
				}
				const buffer = await attachmentBuffer.arrayBuffer();
				const blob = new Blob([buffer], { type: att.mimeType || 'application/octet-stream' });
				formData.append(att.key, blob, att.filename);
			}

			const res = await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMediaGroup`, {
				method: 'POST',
				body: formData
			});

			if (!res.ok) {
				console.error(`发送媒体组失败 status: ${res.status} response: ${await res.text()}`);
			} else {
				console.log(`媒体组发送成功，共 ${batch.length} 个项目`);
			}
		}
	},

	/**
	 * 发送附件到 Telegram Chat（单个附件，逐个发送）
	 */
	async sendAttachmentsToChat(c, tgBotToken, chatId, attachments) {
		for (const attachment of attachments) {
			try {
				// 获取附件内容
				const attachmentBuffer = await r2Service.getObj(c, attachment.key);
				if (!attachmentBuffer) {
					console.error(`附件不存在: ${attachment.key}`);
					continue;
				}

				// 将 Buffer 转换为 Uint8Array
				const buffer = await attachmentBuffer.arrayBuffer();
				const uint8Array = new Uint8Array(buffer);

				// 判断是否为图片类型
				const isImage = attachment.mimeType && attachment.mimeType.startsWith('image/');

				// 构造 FormData
				const formData = new FormData();
				formData.append('chat_id', chatId);

				if (isImage) {
					// 图片使用 sendPhoto
					formData.append('photo', new Blob([uint8Array], { type: attachment.mimeType }), attachment.filename);
				} else {
					// 其他文件使用 sendDocument
					formData.append('document', new Blob([uint8Array], { type: attachment.mimeType }), attachment.filename);
				}

				const endpoint = isImage ? 'sendPhoto' : 'sendDocument';
				const res = await fetch(`https://api.telegram.org/bot${tgBotToken}/${endpoint}`, {
					method: 'POST',
					body: formData
				});

				if (!res.ok) {
					console.error(`发送附件失败 status: ${res.status} response: ${await res.text()}`);
				} else {
					console.log(`附件发送成功: ${attachment.filename}`);
				}
			} catch (e) {
				console.error(`发送附件 ${attachment.filename} 失败:`, e.message);
			}
		}
	}

}

export default telegramService
