import s3Service from './s3-service';
import settingService from './setting-service';
import kvObjService from './kv-obj-service';
import constant from '../const/constant';

const r2Service = {

	async storageType(c) {

		const setting = await settingService.query(c);
		const { bucket, endpoint, s3AccessKey, s3SecretKey } = setting;

		if (!!(bucket && endpoint && s3AccessKey && s3SecretKey)) {
			return 'S3';
		}

		if (c.env.r2) {
			return 'R2';
		}

		return 'KV';
	},

	async putObj(c, key, content, metadata) {

		const storageType = await this.storageType(c);

		if (storageType === 'KV') {
			await kvObjService.putObj(c, key, content, metadata);
		}

		if (storageType === 'R2') {
			await c.env.r2.put(key, content, {
				httpMetadata: { ...metadata }
			});
		}

		if (storageType === 'S3') {
			await s3Service.putObj(c, key, content, metadata);
		}

	},

	async getObj(c, key) {
		const storageType = await this.storageType(c);

		if (storageType === 'KV') {
			return await kvObjService.getObj(c, key);
		}

		if (storageType === 'R2') {
			return await c.env.r2.get(key);
		}

		if (storageType === 'S3') {
			return await s3Service.getObj(c, key);
		}
	},

	async delete(c, key) {

		const storageType = await this.storageType(c);

		if (storageType === 'KV') {
			await kvObjService.deleteObj(c, key);
		}

		if (storageType === 'R2') {
			await c.env.r2.delete(key);
		}

		if (storageType === 'S3'){
			await s3Service.deleteObj(c, key);
		}

	},

	async listObjects(c, prefix) {
		const storageType = await this.storageType(c);

		if (storageType === 'R2') {
			const listed = [];
			let cursor = undefined;
			do {
				const result = await c.env.r2.list({
					prefix,
					cursor,
					limit: 1000
				});
				listed.push(...result.objects);
				cursor = result.truncated ? result.cursor : undefined;
			} while (cursor);
			return listed;
		}

		if (storageType === 'S3') {
			return await s3Service.listObjects(c, prefix);
		}

		// KV 存储不支持列表操作
		return [];
	}

};
export default r2Service;
