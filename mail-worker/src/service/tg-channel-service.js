import orm from '../entity/orm';
import { tgChannel } from '../entity/tg-channel';
import { eq, asc } from 'drizzle-orm';
import { channelType, mediaFilter, tgFileSizeLimit } from '../const/entity-const';
import BizError from '../error/biz-error';

const tgChannelService = {
	/**
	 * 获取所有频道（按优先级排序）
	 */
	async list(c) {
		return orm(c).select().from(tgChannel).orderBy(asc(tgChannel.priority), asc(tgChannel.id)).all();
	},

	/**
	 * 获取所有启用的频道（按优先级排序）
	 */
	async getEnabledChannels(c) {
		return orm(c)
			.select()
			.from(tgChannel)
			.where(eq(tgChannel.enabled, 1))
			.orderBy(asc(tgChannel.priority), asc(tgChannel.id))
			.all();
	},

	/**
	 * 根据 ID 获取频道
	 */
	async getById(c, id) {
		return orm(c).select().from(tgChannel).where(eq(tgChannel.id, id)).get();
	},

	/**
	 * 创建频道
	 */
	async add(c, params) {
		this.validateChannel(params);
		const data = {
			chatId: params.chatId,
			name: params.name || '',
			type: params.type ?? channelType.NOTIFICATION,
			mediaFilter: params.mediaFilter ?? mediaFilter.ALL,
			maxSize: params.maxSize ?? 0,
			archiveEnabled: params.archiveEnabled ?? 0,
			archiveDays: params.archiveDays ?? 7,
			enabled: params.enabled ?? 1,
			priority: params.priority ?? 0,
			threadId: params.threadId ?? 0,
		};
		await orm(c).insert(tgChannel).values(data).run();
	},

	/**
	 * 更新频道
	 */
	async update(c, params) {
		if (!params.id) {
			throw new BizError('频道 ID 不能为空');
		}
		this.validateChannel(params);
		const data = {};
		if (params.chatId !== undefined) data.chatId = params.chatId;
		if (params.name !== undefined) data.name = params.name;
		if (params.type !== undefined) data.type = params.type;
		if (params.mediaFilter !== undefined) data.mediaFilter = params.mediaFilter;
		if (params.maxSize !== undefined) data.maxSize = params.maxSize;
		if (params.archiveEnabled !== undefined) data.archiveEnabled = params.archiveEnabled;
		if (params.archiveDays !== undefined) data.archiveDays = params.archiveDays;
		if (params.enabled !== undefined) data.enabled = params.enabled;
		if (params.priority !== undefined) data.priority = params.priority;
		if (params.threadId !== undefined) data.threadId = params.threadId;
		await orm(c).update(tgChannel).set(data).where(eq(tgChannel.id, params.id)).run();
	},

	/**
	 * 删除频道
	 */
	async remove(c, id) {
		if (!id) {
			throw new BizError('频道 ID 不能为空');
		}
		await orm(c).delete(tgChannel).where(eq(tgChannel.id, id)).run();
	},

	/**
	 * 验证频道参数
	 */
	validateChannel(params) {
		if (!params.chatId) {
			throw new BizError('Chat ID 不能为空');
		}
		if (params.maxSize !== undefined && params.maxSize < 0) {
			throw new BizError('文件大小限制不能为负数');
		}
		// TG Bot API 上传限制 50MB
		if (params.maxSize && params.maxSize > 50) {
			throw new BizError('文件大小限制不能超过 50MB（Telegram Bot API 限制）');
		}
	},

	/**
	 * 测试频道连通性：发送一条测试消息
	 */
	async testChannel(c, id, tgBotToken) {
		const channel = await this.getById(c, id);
		if (!channel) {
			throw new BizError('频道不存在');
		}
		if (!tgBotToken) {
			throw new BizError('Bot Token 未配置');
		}
		const res = await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				chat_id: channel.chatId,
				text: `[Test] 频道 "${channel.name || channel.chatId}" 连通性测试成功`,
			}),
		});
		if (!res.ok) {
			const text = await res.text();
			throw new BizError(`测试失败: ${text}`);
		}
		return { success: true };
	},

	/**
	 * 匹配附件是否符合频道规则
	 */
	matchChannel(channel, attachment) {
		// 媒体类型过滤
		if (channel.mediaFilter === mediaFilter.IMAGE_ONLY) {
			if (!attachment.mimeType || !attachment.mimeType.startsWith('image/')) {
				return false;
			}
		}
		if (channel.mediaFilter === mediaFilter.DOCUMENT_ONLY) {
			if (attachment.mimeType && attachment.mimeType.startsWith('image/')) {
				return false;
			}
		}

		// 文件大小过滤
		if (channel.maxSize > 0 && attachment.size > channel.maxSize * 1024 * 1024) {
			return false;
		}

		// TG Bot API 上传限制 50MB
		if (attachment.size > tgFileSizeLimit.UPLOAD) {
			return false;
		}

		return true;
	},
};

export default tgChannelService;
