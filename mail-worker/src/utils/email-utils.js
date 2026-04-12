import { parseHTML } from 'linkedom';
import verifyUtils from './verify-utils';

const emailUtils = {

	// 统一使用 verify-utils 的 isEmail，避免两套不同的正则
	isEmail(email) {
		if (typeof email !== 'string') return false;
		return verifyUtils.isEmail(email);
	},

	getDomain(email) {
		if (typeof email !== 'string') return '';
		const parts = email.split('@');
		return parts.length === 2 ? parts[1] : '';
	},

	getName(email) {
		if (typeof email !== 'string') return '';
		const parts = email.trim().split('@');
		return parts.length === 2 ? parts[0] : '';
	},

	formatText(text) {
		if (!text) return ''
		return text
			.split('\n')
			.map(line => {
				return line.replace(/[\u200B-\u200F\uFEFF\u034F\u200B-\u200F\u00A0\u3000\u00AD]/g, '')
					.replace(/\s+/g, ' ')
					.trim();
			})
			.join('\n')
			.replace(/\n{3,}/g, '\n')
			.trim();
	},

	htmlToText(content) {
		if (!content) return ''
		try {
			const wrappedContent = content.includes('<body')
				? content
				: `<!DOCTYPE html><html><body>${content}</body></html>`;
			const { document } = parseHTML(wrappedContent);
			document.querySelectorAll('style, script, title').forEach(el => el.remove());
			let text = document.body.innerText;
			return this.formatText(text);
		} catch (e) {
			console.error(e)
			return ''
		}
	}
};

export default emailUtils;
