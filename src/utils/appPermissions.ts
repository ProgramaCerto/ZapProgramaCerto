/**
 * Gerenciador Unificado de Permissões do Aplicativo ZapProgramaCerto
 * Cobre: Notificações, Câmera e Microfone
 */

import { initServiceWorker } from './notifications';

export type PermissionStatusState = 'granted' | 'denied' | 'prompt' | 'unsupported';

/**
 * Solicita permissão para Notificações Nativas no Navegador/Chrome
 */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  // Registra Service Worker se ainda não estiver registrado (essencial para Android Chrome)
  initServiceWorker().catch(() => {});

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch {
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
 * Solicita permissão nativa para Câmera
 */
export async function requestCameraPermission(): Promise<PermissionStatusState> {
  if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'unsupported';
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    // Fecha as trilhas imediatamente após obter a permissão
    stream.getTracks().forEach((track) => track.stop());
    return 'granted';
  } catch (err: unknown) {
    const error = err as { name?: string };
    if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
      return 'denied';
    }
    return 'denied';
  }
}

/**
 * Solicita permissão nativa para Microfone
 */
export async function requestMicrophonePermission(): Promise<PermissionStatusState> {
  if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'unsupported';
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Fecha as trilhas imediatamente após obter a permissão
    stream.getTracks().forEach((track) => track.stop());
    return 'granted';
  } catch (err: unknown) {
    const error = err as { name?: string };
    if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
      return 'denied';
    }
    return 'denied';
  }
}

/**
 * Consulta status atual da Câmera
 */
export async function getCameraPermissionStatus(): Promise<PermissionStatusState> {
  if (typeof window === 'undefined' || !navigator.permissions?.query) {
    return 'prompt';
  }
  try {
    const res = await navigator.permissions.query({ name: 'camera' as unknown as PermissionName });
    return res.state;
  } catch {
    return 'prompt';
  }
}

/**
 * Consulta status atual do Microfone
 */
export async function getMicrophonePermissionStatus(): Promise<PermissionStatusState> {
  if (typeof window === 'undefined' || !navigator.permissions?.query) {
    return 'prompt';
  }
  try {
    const res = await navigator.permissions.query({ name: 'microphone' as unknown as PermissionName });
    return res.state;
  } catch {
    return 'prompt';
  }
}

/**
 * Consulta status atual de Notificações
 */
export function getNotificationPermissionStatus(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * Solicita todas as permissões principais do aplicativo de uma vez
 */
export async function requestAllAppPermissions(): Promise<{
  notifications: NotificationPermission | 'unsupported';
  microphone: PermissionStatusState;
  camera: PermissionStatusState;
}> {
  const notif = await requestNotificationPermission();
  const mic = await requestMicrophonePermission();
  const cam = await requestCameraPermission();

  return {
    notifications: notif,
    microphone: mic,
    camera: cam,
  };
}
