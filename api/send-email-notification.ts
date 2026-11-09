import type { Request, Response } from 'express';
import nodemailer from 'nodemailer';

const SMTP_USER = process.env.SMTP_USER || 'programacerto.suporte@gmail.com';
const SMTP_PASS = (process.env.SMTP_PASS || 'gbwe jotu fsty beoc').replace(/\s+/g, '');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const {
      toEmail,
      senderName,
      senderHandle,
      recipientName,
      messageText,
      messageType,
      sentAt,
      chatUrl,
    } = req.body || {};

    if (!toEmail || typeof toEmail !== 'string' || !toEmail.includes('@')) {
      return res.status(400).json({ success: false, error: 'E-mail do destinatário não informado ou inválido.' });
    }

    const appName = 'ZapProgramaCerto';
    const displaySender = senderName || senderHandle || 'Um contato';
    const formattedTime = sentAt || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const targetUrl = chatUrl || 'https://zap-programacerto.vercel.app';

    const subject = `💬 ${displaySender} está te chamando para uma conversa no ${appName}`;
    const htmlBody = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${displaySender} está te chamando</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
        <div style="max-width: 540px; margin: 30px auto; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08); border: 1px solid #e2e8f0;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #2563eb, #1d4ed8); padding: 28px 24px; text-align: center;">
            <div style="display: inline-block; background-color: #ffffff; border-radius: 14px; padding: 10px; margin-bottom: 10px;">
              <span style="font-size: 26px;">💬</span>
            </div>
            <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">${appName}</h1>
            <p style="margin: 6px 0 0 0; color: #bfdbfe; font-size: 13px;">Chamada para conversa</p>
          </div>

          <!-- Body Content -->
          <div style="padding: 32px 28px; text-align: center;">
            <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6; color: #334155;">
              Olá! O seu contato <strong style="color: #0f172a; font-size: 17px;">${displaySender}</strong> (${senderHandle || ''}) está te chamando para uma conversa no <strong>${appName}</strong>.
            </p>

            <p style="margin: 0 0 24px 0; font-size: 15px; color: #64748b;">
              Clique no botão para você ter uma conversa:
            </p>

            <!-- CTA Button -->
            <div style="text-align: center; margin: 28px 0;">
              <a href="${targetUrl}"
                 style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 16px; font-weight: 700; text-decoration: none; padding: 15px 32px; border-radius: 14px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);">
                📱 Abrir ZapProgramaCerto
              </a>
            </div>

            <p style="margin: 20px 0 0 0; font-size: 12px; color: #94a3b8;">
              ⏰ Chamada enviada às <strong>${formattedTime}</strong>
            </p>
          </div>

          <!-- Footer -->
          <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8;">
            © ${new Date().getFullYear()} ${appName} • Notificações Instantâneas
          </div>
        </div>
      </body>
      </html>
    `;

    const info = await transporter.sendMail({
      from: `"${appName}" <${SMTP_USER}>`,
      to: toEmail,
      subject: subject,
      text: `Olá! Seu contato ${displaySender} (${senderHandle || ''}) está te chamando para uma conversa no ${appName}. Clique no link para você ter uma conversa:\n\n${targetUrl}\n\nEnviada às ${formattedTime}`,
      html: htmlBody,
    });

    return res.json({ success: true, messageId: info.messageId });
  } catch (error: any) {
    console.error('[SMTP] Erro ao enviar e-mail:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
