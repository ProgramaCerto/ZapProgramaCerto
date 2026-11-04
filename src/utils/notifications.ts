/**
 * Gerenciador de Notificações Nativas do Navegador (Chrome / Mobile / Desktop)
 */

let serviceWorkerRegistration: ServiceWorkerRegistration | null = null;

// Inicializa e registra o Service Worker para garantir suporte a notificações no Chrome Mobile
export async function initServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    serviceWorkerRegistration = reg;
    return reg;
  } catch (err) {
    console.warn('Erro ao registrar Service Worker para notificações:', err);
    return null;
  }
}

/**
 * Solicita a permissão nativa de notificações ao Chrome.
 * O próprio navegador (Chrome) exibirá a caixa de diálogo nativa
 * perguntando se o usuário autoriza ou bloqueia notificações.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  // Garante que o Service Worker está ativo para notificações no celular
  initServiceWorker().catch(() => {});

  try {
    // Chama o diálogo nativo do navegador
    const permission = await Notification.requestPermission();
    return permission;
  } catch {
    // Compatibilidade com navegadores mais antigos que usam callback
    return new Promise((resolve) => {
      try {
        Notification.requestPermission((perm) => resolve(perm));
      } catch {
        resolve('unsupported');
      }
    });
  }
}

/**
 * Verifica se a permissão já foi concedida pelo usuário
 */
export function hasNotificationPermission(): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  return Notification.permission === 'granted';
}

/**
 * Retorna o status atual da permissão de notificação no navegador
 */
export function getNotificationPermissionStatus(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * Dispara uma notificação nativa quando chega uma mensagem
 * Funciona tanto no Chrome para Computador quanto no Chrome para Celular (Android)
 */
export async function notifyNewMessage(params: {
  senderName: string;
  senderHandle?: string;
  text?: string;
  type?: 'text' | 'image' | 'audio';
  chatId?: string;
  avatarUrl?: string;
}) {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return;
  }

  // Só exibe se o usuário autorizou no navegador
  if (Notification.permission !== 'granted') {
    return;
  }

  const title = params.senderName || params.senderHandle || 'ZapProgramaCerto';
  let body = params.text || 'Nova mensagem recebida';

  if (params.type === 'image') {
    body = '📷 Foto recebida';
  } else if (params.type === 'audio') {
    body = '🎤 Mensagem de voz recebida';
  }

  const options: NotificationOptions = {
    body,
    icon: params.avatarUrl || '/favicon.ico',
    badge: '/favicon.ico',
    tag: params.chatId || 'zapprogramacerto_chat',
    // Não vibra em excesso caso já esteja com som
    // @ts-expect-error vibrate is standard in web notification options
    vibrate: [200, 100, 200],
    renotify: true,
  };

  try {
    // No Android Chrome, notificações funcionam via ServiceWorkerRegistration.showNotification
    if (serviceWorkerRegistration) {
      await serviceWorkerRegistration.showNotification(title, options);
      return;
    }

    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg) {
        serviceWorkerRegistration = reg;
        await reg.showNotification(title, options);
        return;
      }
    }

    // Fallback padrão para Desktop
    new Notification(title, options);
  } catch (e) {
    try {
      new Notification(title, options);
    } catch {
      // Falha silenciosa caso o dispositivo não suporte
    }
  }
}
