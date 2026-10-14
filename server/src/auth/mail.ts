import nodemailer from 'nodemailer';

export interface GuardianConfirmationMail {
  email: string;
  confirmationUrl: string;
  expiresAt: number;
}

export interface GuardianMailer {
  sendConfirmation(input: GuardianConfirmationMail): Promise<void>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

export function createGuardianMailerFromEnv(): GuardianMailer | null {
  const host = process.env.BELLFIVE_SMTP_HOST?.trim();
  const user = process.env.BELLFIVE_SMTP_USER?.trim();
  const password = process.env.BELLFIVE_SMTP_PASSWORD;
  const from = process.env.BELLFIVE_SMTP_FROM?.trim();
  const port = Number(process.env.BELLFIVE_SMTP_PORT ?? 587);
  const secure = process.env.BELLFIVE_SMTP_SECURE === 'true';
  if (!host || !user || !password || !from || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass: password } });
  return {
    async sendConfirmation(input) {
      const expiry = new Date(input.expiresAt).toISOString();
      const safeUrl = escapeHtml(input.confirmationUrl);
      await transporter.sendMail({
        from, to: input.email,
        subject: '请确认 BellFive 未成年人账号授权',
        text: `请由监护人本人完成 BellFive 账号与联机功能的确认。该链接将在 ${expiry} 过期。\n\n${input.confirmationUrl}\n\n如果你没有发起此操作，请忽略此邮件。`,
        html: `<p>请由监护人本人完成 BellFive 账号与联机功能的确认。</p><p>该链接将在 ${expiry} 过期。</p><p><a href="${safeUrl}">打开监护人确认页</a></p><p>如果你没有发起此操作，请忽略此邮件。</p>`,
      });
    },
  };
}
