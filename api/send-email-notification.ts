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
    const targetUrl = 'https://zap-programacerto.vercel.app';

    let contentPreview = messageText || '';
    if (messageType === 'image') {
      contentPreview = '📷 [Foto enviada]';
    } else if (messageType === 'audio') {
      contentPreview = '🎤 [Mensagem de áudio]';
    }

    const htmlBody = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nova mensagem de ${displaySender}</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
        <div style="max-width: 560px; margin: 30px auto; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08); border: 1px solid #e2e8f0;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #2563eb, #1d4ed8); padding: 28px 24px; text-align: center;">
            <div style="display: inline-block; background-color: #ffffff; border-radius: 14px; padding: 10px; margin-bottom: 10px;">
              <span style="font-size: 26px;">💬</span>
            </div>
            <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">${appName}</h1>
            <p style="margin: 6px 0 0 0; color: #bfdbfe; font-size: 13px;">Nova mensagem recebida</p>
          </div>

          <!-- Body Content -->
          <div style="padding: 32px 28px;">
            <p style="margin: 0 0 18px 0; font-size: 15px; line-height: 1.5; color: #334155;">
              Olá${recipientName ? `, <strong>${recipientName}</strong>` : ''}! O seu contato <strong style="color: #0f172a; font-size: 16px;">${displaySender}</strong> (${senderHandle || ''}) te mandou a seguinte mensagem no <strong>${appName}</strong>:
            </p>

            <!-- Message Card -->
            <div style="background-color: #f8fafc; border-left: 4px solid #2563eb; border-radius: 0 12px 12px 0; padding: 18px 20px; margin-bottom: 24px;">
              <p style="margin: 0; font-size: 16px; font-weight: 500; color: #0f172a; word-break: break-word;">
                "${contentPreview}"
              </p>
              <p style="margin: 10px 0 0 0; font-size: 12px; color: #64748b;">
                ⏰ Enviada às <strong>${formattedTime}</strong>
              </p>
            </div>

            <!-- CTA Button -->
            <div style="text-align: center; margin: 30px 0 20px 0;">
              <a href="${targetUrl}"
                 style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 28px; border-radius: 12px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);">
                📱 Abrir conversa no celular
              </a>
            </div>

            <p style="margin: 24px 0 0 0; font-size: 12px; text-align: center; color: #94a3b8; line-height: 1.4;">
              Esta notificação foi enviada automaticamente pelo ${appName} porque este e-mail foi cadastrado na sua conta.
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
      subject: `💬 ${displaySender} te mandou uma mensagem no ${appName}`,
      text: `${displaySender} te mandou a seguinte mensagem no ${appName}:\n\n"${contentPreview}"\n\nEnviada às ${formattedTime}\n\nAcesse: ${targetUrl}`,
      html: htmlBody,
    });

    return res.json({ success: true, messageId: info.messageId });
  } catch (error: any) {
    console.error('[SMTP] Erro ao enviar e-mail:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
