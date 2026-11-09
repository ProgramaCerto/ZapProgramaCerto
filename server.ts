import express from 'express';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '15mb' }));

// Configuração do transporter SMTP do Gmail com as credenciais informadas pelo usuário
const SMTP_USER = process.env.SMTP_USER || 'programacerto.suporte@gmail.com';
const SMTP_PASS = (process.env.SMTP_PASS || 'gbwe jotu fsty beoc').replace(/\s+/g, '');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

// Verificação de prontidão da conexão SMTP
transporter.verify((err) => {
  if (err) {
    console.warn('[SMTP] Aviso ao verificar conexão Gmail SMTP:', err.message);
  } else {
    console.log('[SMTP] Conexão Gmail SMTP pronta para envio de e-mails via:', SMTP_USER);
  }
});

// Endpoint para envio de notificação por e-mail quando uma mensagem for enviada
app.post('/api/send-email-notification', async (req, res) => {
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
    } = req.body;

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

    console.log('[SMTP] Notificação por e-mail enviada com sucesso para:', toEmail, 'MessageId:', info.messageId);
    return res.json({ success: true, messageId: info.messageId });
  } catch (error: any) {
    console.error('[SMTP] Erro ao enviar notificação por e-mail:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint de teste de e-mail
app.post('/api/test-email', async (req, res) => {
  try {
    const { toEmail } = req.body;
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
        </div>
      `,
    });

    return res.json({ success: true, messageId: info.messageId });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
