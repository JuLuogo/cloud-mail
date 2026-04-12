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
import { attConst, channelType } from '../const/entity-const';
import tgChannelService from './tg-channel-service';
import tgArchiveService from './tg-archive-service';

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

	async sendEmailToBot(c, emailRow) {

		const { tgBotToken, tgChatId, customDomain, tgMsgTo, tgMsgFrom, tgMsgText } = await settingService.query(c);

		if (!tgBotToken) return;

		const jwtToken = await jwtUtils.generateToken(c, { emailId: emailRow.emailId })

		const webAppUrl = customDomain ? `${domainUtils.toOssDomain(customDomain)}/api/telegram/getEmail/${jwtToken}` : 'https://www.cloudflare.com/404'

		// 查询邮件附件（普通附件 contentId 为空，内嵌图片 contentId 不为空）
		const attachments = await orm(c).select().from(attEntity).where(
			and(
				eq(attEntity.emailId, emailRow.emailId),
				eq(attEntity.userId, emailRow.userId),
				eq(attEntity.type, attConst.type.ATT)
			)
		).all();

		// 区分普通附件和内嵌图片
		const regularAttachments = attachments.filter(att => !att.contentId);
		const inlineImages = attachments.filter(att => att.contentId);

		// 构建消息文字
		const messageText = emailMsgTemplate(emailRow, tgMsgTo, tgMsgFrom, tgMsgText, regularAttachments, inlineImages);

		// 合并所有附件：内嵌图片优先，然后是普通附件
		const allAttachments = [...inlineImages, ...regularAttachments];

		// 获取多频道配置
		let channels = [];
		try {
			channels = await tgChannelService.getEnabledChannels(c);
		} catch (e) {
			// tg_channel 表可能还不存在（未迁移），忽略错误
			console.warn('[TG] tg_channel 表查询失败，使用旧版 tgChatId:', e.message);
		}

		if (channels.length > 0) {
			// 多频道模式
			await this.sendToMultiChannels(c, tgBotToken, channels, allAttachments, messageText, webAppUrl);
		} else if (tgChatId) {
			// 向后兼容：使用旧的 tgChatId 配置
			await this.sendToLegacyChatIds(c, tgBotToken, tgChatId, allAttachments, messageText, webAppUrl);
		}
	},

	/**
	 * 多频道分发模式
	 */
	async sendToMultiChannels(c, tgBotToken, channels, allAttachments, messageText, webAppUrl) {
		for (const channel of channels) {
			try {
				if (allAttachments.length > 0) {
					// 过滤出匹配此频道规则的附件
					const matchedAtts = allAttachments.filter(att => tgChannelService.matchChannel(channel, att));

					if (matchedAtts.length > 0) {
						// 发送匹配的附件到此频道
						const results = await this.sendMediaGroup(c, tgBotToken, channel.chatId, channel.threadId, matchedAtts, messageText, webAppUrl);

						// 如果是归档/混合频道，记录归档信息
						if (channel.type === channelType.ARCHIVE || channel.type === channelType.HYBRID) {
							await this.recordArchiveResults(c, channel, matchedAtts, results);
						}
					} else if (channel.type === channelType.NOTIFICATION || channel.type === channelType.HYBRID) {
						// 没有匹配的附件，但通知/混合频道仍发送文本消息
						await this.sendTextMessage(tgBotToken, channel.chatId, channel.threadId, messageText, webAppUrl);
					}
				} else {
					// 无附件：通知/混合频道发送文本
					if (channel.type !== channelType.ARCHIVE) {
						await this.sendTextMessage(tgBotToken, channel.chatId, channel.threadId, messageText, webAppUrl);
					}
				}
			} catch (e) {
				console.error(`[TG] 频道 ${channel.name || channel.chatId} 发送失败:`, e.message);
			}
		}
	},

	/**
	 * 记录归档结果（从 sendMediaGroup 返回的 TG file_id 信息）
	 */
	async recordArchiveResults(c, channel, attachments, results) {
		if (!results || results.length === 0) return;

		const MAX_MEDIA_PER_GROUP = 10;

		// results 数组与 batches 一一对应（失败的批次为 null）
		// 通过 batchIndex 计算正确的附件偏移量
		for (let batchIndex = 0; batchIndex < results.length; batchIndex++) {
			const msgResult = results[batchIndex];
			if (!msgResult || !msgResult.result) continue;

			const batchOffset = batchIndex * MAX_MEDIA_PER_GROUP;
			const messages = Array.isArray(msgResult.result) ? msgResult.result : [msgResult.result];

			for (let msgIndex = 0; msgIndex < messages.length; msgIndex++) {
				const msg = messages[msgIndex];
				const attIndex = batchOffset + msgIndex;
				if (attIndex >= attachments.length) break;

				const fileInfo = this.extractFileInfo(msg);
				if (fileInfo) {
					try {
						await tgArchiveService.recordArchive(c, attachments[attIndex].attId, channel.id, {
							file_id: fileInfo.file_id,
							message_id: msg.message_id,
							file_unique_id: fileInfo.file_unique_id,
						});
					} catch (e) {
						console.error(`[TG Archive] 记录归档失败:`, e.message);
					}
				}
			}
		}
	},

	/**
	 * 从 TG 消息中提取文件信息
	 */
	extractFileInfo(msg) {
		const mediaTypes = ['document', 'photo', 'video', 'audio', 'voice', 'animation'];
		for (const type of mediaTypes) {
			if (msg[type]) {
				const media = type === 'photo'
					? msg[type][msg[type].length - 1] // photo 返回多个尺寸，取最大的
					: msg[type];
				return {
					file_id: media.file_id,
					file_unique_id: media.file_unique_id,
				};
			}
		}
		return null;
	},

	/**
	 * 向后兼容：使用旧的 tgChatId 配置发送
	 */
	async sendToLegacyChatIds(c, tgBotToken, tgChatId, allAttachments, messageText, webAppUrl) {
		const tgChatIds = tgChatId.split(',');

		await Promise.all(tgChatIds.map(async chatId => {
			try {
				if (allAttachments.length > 0) {
					await this.sendMediaGroup(c, tgBotToken, chatId, 0, allAttachments, messageText, webAppUrl);
				} else {
					await this.sendTextMessage(tgBotToken, chatId, 0, messageText, webAppUrl);
				}
			} catch (e) {
				console.error(`转发 Telegram 失败:`, e.message);
			}
		}));
	},

	/**
	 * 发送文本消息到 Telegram
	 */
	async sendTextMessage(tgBotToken, chatId, threadId, text, webAppUrl) {
		const body = {
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
		};
		// 如果设置了话题ID，添加到请求中
		if (threadId && threadId > 0) {
			body.message_thread_id = threadId;
		}
		const res = await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
		});
		if (!res.ok) {
			console.error(`转发 Telegram 失败 status: ${res.status} response: ${await res.text()}`);
		}
	},

	/**
	 * 发送媒体组（多张图片/文件 + 文字 caption）在同一条消息中
	 * Telegram 的 sendMediaGroup 最多支持 10 个媒体项目
	 * 返回 TG API 的响应数组（用于归档记录 file_id）
	 */
	async sendMediaGroup(c, tgBotToken, chatId, threadId, attachments, caption, webAppUrl) {
		const MAX_MEDIA_PER_GROUP = 10;
		const results = [];

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
					parse_mode: 'HTML'
				};

				// 只有第一张图片/文件的 caption 会生效
				if (isFirstBatch && i === 0) {
					mediaItem.caption = caption;
				}

				media.push(mediaItem);
			}

			// 最后一批添加查看按钮
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

			// 如果设置了话题ID，添加到请求中
			if (threadId && threadId > 0) {
				formData.append('message_thread_id', threadId);
			}

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
				results.push(null);
			} else {
				const resData = await res.json();
				results.push(resData);
				console.log(`媒体组发送成功，共 ${batch.length} 个项目`);
			}
		}

		return results;
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
