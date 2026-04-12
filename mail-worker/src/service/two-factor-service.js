import orm from '../entity/orm';
import user from '../entity/user';
import { eq, and } from 'drizzle-orm';
import { t } from '../i18n/i18n';
import BizError from '../error/biz-error';

const twoFactorService = {

	generateSecret() {
		const array = new Uint8Array(20);
		crypto.getRandomValues(array);
		return this.base32Encode(array);
	},

	generateOtpUrl(email, secret) {
		const issuer = encodeURIComponent('CloudMail');
		const label = encodeURIComponent(email);
		return `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}`;
	},

	async getSetupData(c, userId) {
		// 只查询需要的字段，避免暴露敏感信息
		const userRow = await orm(c).select({
			email: user.email,
			totpSecret: user.totpSecret,
			totpEnabled: user.totpEnabled
		}).from(user)
			.where(and(eq(user.userId, userId), eq(user.isDel, 0))).get();

		if (!userRow) {
			throw new BizError(t('notExistUser'), 404);
		}

		// 2FA 已启用时，不返回密钥明文，防止 session 被劫持后泄露密钥
		if (userRow.totpSecret && userRow.totpEnabled) {
			return {
				enabled: true
			};
		}

		const secret = this.generateSecret();
		const otpUrl = this.generateOtpUrl(userRow.email, secret);

		return {
			secret,
			otpUrl
		};
	},

	async enable(c, params, userId) {
		const { code, secret } = params;

		if (!await this.verifyCode(secret, code)) {
			throw new BizError(t('invalidTwoFactorCode'), 400);
		}

		await orm(c).update(user).set({
			totpSecret: secret,
			totpEnabled: 1,
			totpBindTime: new Date().toISOString()
		}).where(eq(user.userId, userId)).run();
	},

	async disable(c, params, userId) {
		const { code } = params;

		// 只查询需要的字段
		const userRow = await orm(c).select({
			totpSecret: user.totpSecret,
			totpEnabled: user.totpEnabled
		}).from(user)
			.where(eq(user.userId, userId)).get();

		if (!userRow?.totpEnabled) {
			throw new BizError(t('twoFactorNotEnabled'));
		}

		if (!await this.verifyCode(userRow.totpSecret, code)) {
			throw new BizError(t('invalidTwoFactorCode'), 400);
		}

		await orm(c).update(user).set({
			totpSecret: null,
			totpEnabled: 0,
			totpBindTime: null
		}).where(eq(user.userId, userId)).run();
	},

	async verify(c, params, userId) {
		const { code } = params;

		// 只查询需要的字段
		const userRow = await orm(c).select({
			totpSecret: user.totpSecret,
			totpEnabled: user.totpEnabled
		}).from(user)
			.where(and(eq(user.userId, userId), eq(user.isDel, 0))).get();

		if (!userRow || !userRow.totpEnabled) {
			return { verified: false, need2FA: false };
		}

		const verified = await this.verifyCode(userRow.totpSecret, code);
		return { verified, need2FA: true };
	},

	async isEnabled(c, userId) {
		const userRow = await orm(c).select({ totpEnabled: user.totpEnabled }).from(user)
			.where(and(eq(user.userId, userId), eq(user.isDel, 0))).get();
		return userRow?.totpEnabled === 1;
	},

	async verifyCode(secret, code) {
		const timeStep = Math.floor(Date.now() / 30000);
		const codeInt = parseInt(code, 10);

		for (let i = -1; i <= 1; i++) {
			const expectedCode = await this.calculateTOTP(secret, timeStep + i);
			if (expectedCode === codeInt) {
				return true;
			}
		}
		return false;
	},

	async calculateTOTP(secret, timeStep) {
		const timeBytes = new Uint8Array(8);
		for (let i = 7; i >= 0; i--) {
			timeBytes[i] = timeStep & 0xff;
			timeStep >>= 8;
		}

		const key = this.base32Decode(secret);

		// 使用 Web Crypto API 计算 HMAC-SHA1
		const cryptoKey = await crypto.subtle.importKey(
			'raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
		);
		const signature = await crypto.subtle.sign('HMAC', cryptoKey, timeBytes);
		const hmacKey = new Uint8Array(signature);

		const offset = hmacKey[hmacKey.length - 1] & 0x0f;
		const binary = ((hmacKey[offset] & 0x7f) << 24)
			| ((hmacKey[offset + 1] & 0xff) << 16)
			| ((hmacKey[offset + 2] & 0xff) << 8)
			| (hmacKey[offset + 3] & 0xff);

		return binary % 1000000;
	},

	base32Encode(data) {
		const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
		let result = '';
		let buffer = 0;
		let bitsLeft = 0;

		for (const byte of data) {
			buffer = (buffer << 8) | byte;
			bitsLeft += 8;
			while (bitsLeft >= 5) {
				result += alphabet[(buffer >> (bitsLeft - 5)) & 0x1f];
				bitsLeft -= 5;
			}
		}

		if (bitsLeft > 0) {
			result += alphabet[(buffer << (5 - bitsLeft)) & 0x1f];
		}

		return result;
	},

	base32Decode(str) {
		const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
		str = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
		const bytes = [];
		let buffer = 0;
		let bitsLeft = 0;

		for (const char of str) {
			const value = alphabet.indexOf(char);
			if (value < 0) continue;
			buffer = (buffer << 5) | value;
			bitsLeft += 5;
			if (bitsLeft >= 8) {
				bytes.push((buffer >> (bitsLeft - 8)) & 0xff);
				bitsLeft -= 8;
			}
		}

		return new Uint8Array(bytes);
	}
};

export default twoFactorService;
