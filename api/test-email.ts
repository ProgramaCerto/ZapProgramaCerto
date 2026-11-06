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
    const { toEmail } = req.body || {};
    if (!toEmail || !toEmail.includes('@')) {
      return res.status(400).json({ success: false, error: 'E-mail para teste inválido.' });
    }

    const info = await transporter.sendMail({
      from: `"ZapProgramaCerto" <${SMTP_USER}>`,
      to: toEmail,
      subject: '✅ Teste de Notificação ZapProgramaCerto',
      text: 'Olá! O sistema de notificações por e-mail do ZapProgramaCerto via Gmail SMTP está configurado e funcionando perfeitamente!',
      html: `
        <div style="font-family: sans-serif; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 500px; margin: auto;">
          <h2 style="color: #2563eb; margin-top: 0;">ZapProgramaCerto</h2>
          <p>Olá! Este é um e-mail de teste para confirmar que o <strong>servidor SMTP do Gmail</strong> está funcionando perfeitamente.</p>
          <p style="color: #10b981; font-weight: bold;">✅ Conexão e envio autorizados!</p>
          <p><a href="https://zap-programacerto.vercel.app" style="color: #2563eb; font-weight: bold;">Acessar ZapProgramaCerto</a></p>
        </div>
      `,
    });

    return res.json({ success: true, messageId: info.messageId });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
