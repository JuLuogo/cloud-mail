import orm from '../entity/orm';
import { tgArchive } from '../entity/tg-archive';
import { tgChannel } from '../entity/tg-channel';
import { att } from '../entity/att';
import { eq, and, lt, inArray, count } from 'drizzle-orm';
import r2Service from './r2-service';
import settingService from './setting-service';

const tgArchiveService = {
	/**
	 * 记录附件归档信息
	 */
	async recordArchive(c, attId, channelId, tgFileInfo) {
		await orm(c)
			.insert(tgArchive)
			.values({
				attId,
				channelId,
				tgFileId: tgFileInfo.file_id,
				tgMessageId: tgFileInfo.message_id || null,
				tgFileUniqueId: tgFileInfo.file_unique_id || null,
			})
			.run();
	},

	/**
	 * 根据 attId 获取归档记录
	 */
	async getByAttId(c, attId) {
		return orm(c).select().from(tgArchive).where(eq(tgArchive.attId, attId)).get();
	},

	/**
	 * 从 TG 恢复文件到 R2
	 */
	async restoreFromTg(c, attId) {
		const archive = await this.getByAttId(c, attId);
		if (!archive || !archive.tgFileId) {
			return null;
		}

		const { tgBotToken } = await settingService.query(c);
		if (!tgBotToken) {
			return null;
		}

		// 获取文件路径
		const fileRes = await fetch(`https://api.telegram.org/bot${tgBotToken}/getFile`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ file_id: archive.tgFileId }),
		});

		if (!fileRes.ok) {
			console.error(`[TG Archive] getFile failed: ${await fileRes.text()}`);
			return null;
		}

		const fileData = await fileRes.json();
		if (!fileData.ok || !fileData.result?.file_path) {
			console.error('[TG Archive] getFile response invalid');
			return null;
		}

		// 下载文件
		const downloadUrl = `https://api.telegram.org/file/bot${tgBotToken}/${fileData.result.file_path}`;
		const downloadRes = await fetch(downloadUrl);
		if (!downloadRes.ok) {
			console.error(`[TG Archive] download failed: ${downloadRes.status}`);
			return null;
		}

		// 获取附件信息并存回 R2
		const attRow = await orm(c).select().from(att).where(eq(att.attId, attId)).get();
		if (!attRow) {
			return null;
		}

		const content = await downloadRes.arrayBuffer();
		await r2Service.putObj(c, attRow.key, content, {
			contentType: attRow.mimeType,
		});

		// 重置归档时间，避免立即被清理
		await orm(c)
			.update(tgArchive)
			.set({ cacheCleaned: 0, archivedAt: new Date().toISOString() })
			.where(eq(tgArchive.id, archive.id))
			.run();

		return content;
	},

	/**
	 * 定时清理过期的 R2 缓存（已归档到 TG 的附件）
	 */
	async cleanupExpiredCache(c) {
		// 获取所有启用归档的频道及其归档天数
		const channels = await orm(c)
			.select()
			.from(tgChannel)
			.where(and(eq(tgChannel.archiveEnabled, 1), eq(tgChannel.enabled, 1)))
			.all();

		if (channels.length === 0) {
			return { cleaned: 0 };
		}

		let totalCleaned = 0;

		for (const channel of channels) {
			if (channel.archiveDays <= 0) {
				// archiveDays=0 表示永久保存，不清理 R2
				continue;
			}

			const expireDate = new Date();
			expireDate.setDate(expireDate.getDate() - channel.archiveDays);
			const expireDateStr = expireDate.toISOString();

			// 查找此频道中已归档且过期且尚未清理缓存的附件
			const expiredArchives = await orm(c)
				.select({
					id: tgArchive.id,
					attId: tgArchive.attId,
				})
				.from(tgArchive)
				.where(
					and(
						eq(tgArchive.channelId, channel.id),
						eq(tgArchive.cacheCleaned, 0),
						lt(tgArchive.archivedAt, expireDateStr),
					),
				)
				.all();

			if (expiredArchives.length === 0) {
				continue;
			}

			// 分批处理
			const CHUNK_SIZE = 100;
			for (let i = 0; i < expiredArchives.length; i += CHUNK_SIZE) {
				const chunk = expiredArchives.slice(i, i + CHUNK_SIZE);
				const attIds = chunk.map((a) => a.attId);

				// 获取附件的 key
				const attRows = await orm(c)
					.select({ attId: att.attId, key: att.key })
					.from(att)
					.where(inArray(att.attId, attIds))
					.all();

				// 删除 R2 缓存
				const keysToDelete = attRows.map((a) => a.key);
				if (keysToDelete.length > 0) {
					const BATCH_SIZE = 1000;
					for (let j = 0; j < keysToDelete.length; j += BATCH_SIZE) {
						const batch = keysToDelete.slice(j, j + BATCH_SIZE);
						await r2Service.delete(c, batch);
					}
				}

				// 标记已清理缓存
				const archiveIds = chunk.map((a) => a.id);
				await orm(c)
					.update(tgArchive)
					.set({ cacheCleaned: 1 })
					.where(inArray(tgArchive.id, archiveIds))
					.run();

				totalCleaned += chunk.length;
			}
		}

		return { cleaned: totalCleaned };
	},

	/**
	 * 获取归档统计信息
	 */
	async getArchiveStats(c) {
		const totalResult = await orm(c)
			.select({ cnt: count() })
			.from(tgArchive)
			.get();

		const cleanedResult = await orm(c)
			.select({ cnt: count() })
			.from(tgArchive)
			.where(eq(tgArchive.cacheCleaned, 1))
			.get();

		const totalArchived = totalResult?.cnt || 0;
		const cacheCleaned = cleanedResult?.cnt || 0;

		return {
			totalArchived,
			cacheCleaned,
			cacheActive: totalArchived - cacheCleaned,
		};
	},
};

export default tgArchiveService;
