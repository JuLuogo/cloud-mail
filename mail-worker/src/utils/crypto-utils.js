const encoder = new TextEncoder();

// PBKDF2 迭代次数，平衡安全性与 Cloudflare Workers CPU 时间限制
const PBKDF2_ITERATIONS = 100000;

const saltHashUtils = {

	generateSalt(length = 16) {
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		return this.uint8ToBase64(array);
	},


	async hashPassword(password) {
		const salt = this.generateSalt();
		const hash = await this.genHashPassword(password, salt);
		return { salt, hash };
	},

	async genHashPassword(password, salt) {
		const keyMaterial = await crypto.subtle.importKey(
			'raw',
			encoder.encode(password),
			'PBKDF2',
			false,
			['deriveBits']
		);
		const hashBuffer = await crypto.subtle.deriveBits(
			{
				name: 'PBKDF2',
				salt: encoder.encode(salt),
				iterations: PBKDF2_ITERATIONS,
				hash: 'SHA-256'
			},
			keyMaterial,
			256
		);
		const hashArray = new Uint8Array(hashBuffer);
		return this.uint8ToBase64(hashArray);
	},

	// 旧版 SHA-256 哈希（用于兼容验证）
	async _legacySha256Hash(password, salt) {
		const data = encoder.encode(salt + password);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = new Uint8Array(hashBuffer);
		return this.uint8ToBase64(hashArray);
	},

	async verifyPassword(inputPassword, salt, storedHash) {
		// 先尝试 PBKDF2 验证
		const pbkdf2Hash = await this.genHashPassword(inputPassword, salt);
		if (pbkdf2Hash === storedHash) return true;
		// 回退到旧版 SHA-256 验证（兼容已有用户）
		const sha256Hash = await this._legacySha256Hash(inputPassword, salt);
		return sha256Hash === storedHash;
	},

	genRandomPwd(length = 8) {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		const randomBytes = new Uint8Array(length);
		crypto.getRandomValues(randomBytes);
		let result = '';
		for (let i = 0; i < length; i++) {
			result += chars.charAt(randomBytes[i] % chars.length);
		}
		return result;
	},

	// 安全地将 Uint8Array 转为 base64，避免 String.fromCharCode(...largeArray) 栈溢出
	uint8ToBase64(uint8Array) {
		let binary = '';
		for (let i = 0; i < uint8Array.length; i++) {
			binary += String.fromCharCode(uint8Array[i]);
		}
		return btoa(binary);
	}
};

export default saltHashUtils;
