/**
 * @frontcore/notifications
 * Contrato genérico de notificações para FrontCore (email, etc.).
 * Implementação concreta entra em fase futura.
 */

export type NotificationChannel = 'email' | 'webhook';

/** Notificação genérica a entregar. */
export interface Notification {
  channel: NotificationChannel;
  to: string;
  subject: string;
  body: string;
}

/** Contrato de envio de notificações. */
export interface NotificationSender {
  send(notification: Notification): Promise<void>;
}
