import PostalMime from 'postal-mime';
import emailService from '../service/email-service';
import accountService from '../service/account-service';
import settingService from '../service/setting-service';
import attService from '../service/att-service';
import constant from '../const/constant';
import fileUtils from '../utils/file-utils';
import { emailConst, isDel, settingConst } from '../const/entity-const';
import emailUtils from '../utils/email-utils';
import roleService from '../service/role-service';
import userService from '../service/user-service';
import telegramService from '../service/telegram-service';
import forwardRuleService from '../service/forward-rule-service';
import orm from '../entity/orm';
import emailEntity from '../entity/email';

export async function email(message, env, ctx) {

	try {

		const {
			receive,
			tgChatId,
			tgBotStatus,
			forwardStatus,
			forwardEmail,
			ruleEmail,
			ruleType,
			r2Domain,
			noRecipient,
			domainList
		} = await settingService.query({ env });

		if (receive === settingConst.receive.CLOSE) {
			message.setReject('Service suspended');
			return;
		}


		const reader = message.raw.getReader();
		let content = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			content += new TextDecoder().decode(value);
		}

		const email = await PostalMime.parse(content);

		const account = await accountService.selectByEmailIncludeDel({ env: env }, message.to);

		// Catch-all 规则匹配（优先于 noRecipient 检查）
		let forwardRules = [];
		if (!account) {
			forwardRules = await forwardRuleService.findMatchingRules({ env: env }, message.to);
		}

		// 如果没有匹配的 catch-all 规则，且 noRecipient 关闭，则拒绝邮件
		if (!account && forwardRules.length === 0 && noRecipient === settingConst.noRecipient.CLOSE) {
			message.setReject('Recipient not found');
			return;
		}

		let userRow = {}

		if (account) {
			 userRow = await userService.selectByIdIncludeDel({ env: env }, account.userId);
		}

		if (account && userRow.email !== env.admin) {

			let { banEmail, availDomain } = await roleService.selectByUserId({ env: env }, account.userId);

			if (!roleService.hasAvailDomainPerm(availDomain, message.to)) {
				message.setReject('The recipient is not authorized to use this domain.');
				return;
			}

			if(roleService.isBanEmail(banEmail, email.from.address)) {
				message.setReject('The recipient is disabled from receiving emails.');
				return;
			}

		}


		if (!email.to) {
			email.to = [{ address: message.to, name: emailUtils.getName(message.to)}]
		}

		const toName = email.to.find(item => item.address === message.to)?.name || '';

		const params = {
			toEmail: message.to,
			toName: toName,
			sendEmail: email.from.address,
			name: email.from.name || emailUtils.getName(email.from.address),
			subject: email.subject,
			content: email.html,
			text: email.text,
			cc: email.cc ? JSON.stringify(email.cc) : '[]',
			bcc: email.bcc ? JSON.stringify(email.bcc) : '[]',
			recipient: JSON.stringify(email.to),
			inReplyTo: email.inReplyTo,
			relation: email.references,
			messageId: email.messageId,
			userId: account ? account.userId : 0,
			accountId: account ? account.accountId : 0,
			isDel: isDel.DELETE,
			status: emailConst.status.SAVING
		};

		const attachments = [];
		const cidAttachments = [];

		for (let item of email.attachments) {
			let attachment = { ...item };
			attachment.key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(attachment.content) + fileUtils.getExtFileName(item.filename);
			attachment.size = item.content.length ?? item.content.byteLength;
			attachments.push(attachment);
			if (attachment.contentId) {
				cidAttachments.push(attachment);
			}
		}

		let emailRow = await emailService.receive({ env }, params, cidAttachments, r2Domain);

		attachments.forEach(attachment => {
			attachment.emailId = emailRow.emailId;
			attachment.userId = emailRow.userId;
			attachment.accountId = emailRow.accountId;
		});

		try {
			if (attachments.length > 0) {
				await attService.addAtt({ env }, attachments);
			}
		} catch (e) {
			console.error(e);
		}

		emailRow = await emailService.completeReceive({ env }, account ? emailConst.status.RECEIVE : emailConst.status.NOONE, emailRow.emailId);


		if (ruleType === settingConst.ruleType.RULE) {

			const emails = ruleEmail.split(',');

			if (!emails.includes(message.to)) {
				return;
			}

		}

		//转发到TG
		if (tgBotStatus === settingConst.tgBotStatus.OPEN && tgChatId) {
			await telegramService.sendEmailToBot({ env }, emailRow)
		}

		// 用户级转发功能已屏蔽，暂时只使用全局转发设置
		// TODO: 后续版本重新启用用户级转发
		// if (userRow && userRow.forwardStatus === 1) {
		// 	// 用户开启了转发，使用用户的转发邮箱
		// } else if (userRow && userRow.forwardStatus === 2) {
		// 	// 用户关闭了转发
		// } else {
		// 	// 用户继承全局设置 或 无 account/userRow
		// }

		// Catch-all 规则转发
		for (const forwardRule of forwardRules) {
			const forwardTo = forwardRule.forwardTo.trim();
			const targetDomain = '@' + emailUtils.getDomain(forwardTo);
			const isInternalDomain = domainList.includes(targetDomain);

			console.log(`[Catch-all] 匹配: ${message.to} -> ${forwardTo}, 内部域名: ${isInternalDomain}`);

			if (isInternalDomain) {
				// 内部域名：直接保存邮件到目标用户收件箱
				try {
					const targetAccount = await accountService.selectByEmailIncludeDel({ env }, forwardTo);
					if (targetAccount) {
						// 构建邮件数据，直接保存到目标用户收件箱
						const emailData = {
							toEmail: forwardTo,
							toName: emailUtils.getName(forwardTo),
							sendEmail: email.from.address,
							name: email.from.name || emailUtils.getName(email.from.address),
							subject: email.subject,
							content: email.html,
							text: email.text,
							cc: email.cc ? JSON.stringify(email.cc) : '[]',
							bcc: email.bcc ? JSON.stringify(email.bcc) : '[]',
							recipient: JSON.stringify(email.to),
							inReplyTo: email.inReplyTo,
							relation: email.references,
							messageId: email.messageId,
							userId: targetAccount.userId,
							accountId: targetAccount.accountId,
							isDel: isDel.NORMAL,
							status: emailConst.status.RECEIVE
						};

						await orm({ env }).insert(emailEntity).values(emailData).returning().get();
						console.log(`[Catch-all] 内部转发成功: ${message.to} -> ${forwardTo}`);
					} else {
						console.error(`[Catch-all] 内部转发失败: 目标账户不存在 ${forwardTo}`);
					}
				} catch (e) {
					console.error(`[Catch-all] 内部转发失败: ${e}`);
				}
			} else {
				// 外部域名：使用 message.forward() 发送
				try {
					console.log(`[Catch-all] 开始转发到: ${forwardTo}`);
					await message.forward(forwardTo);
					console.log(`[Catch-all] 转发成功`);
				} catch (e) {
					console.error(`[Catch-all] 转发失败: ${e}`);
				}
			}
		}

		//转发到其他邮箱（仅使用全局设置）
		if (forwardStatus === settingConst.forwardStatus.OPEN && forwardEmail) {

			const emails = forwardEmail.split(',');

			await Promise.all(emails.map(async email => {

				try {
					await message.forward(email.trim());
				} catch (e) {
					console.error(`转发邮箱 ${email} 失败：`, e);
				}

			}));

		}

	} catch (e) {
		console.error('邮件接收异常: ', e);
		throw e
	}
}
