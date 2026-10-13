import { Injectable, Logger } from '@nestjs/common';

type WhatsAppStatus =
  | 'initializing'
  | 'waiting_qr'
  | 'connected'
  | 'disconnected'
  | 'error';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly status: WhatsAppStatus = 'disconnected';

  getStatus() {
    return {
      status: this.status,
      qrDataUrl: null,
      currentUser: null,
      lastError: 'WhatsApp deshabilitado temporalmente para proteger el servidor.',
      ready: false,
    };
  }

  async restart() {
    this.logger.warn('WhatsApp esta deshabilitado temporalmente');
  }

  async sendSessionReport(_sessionId: string): Promise<boolean> {
    this.logger.warn('Reporte por WhatsApp omitido: integracion deshabilitada');
    return false;
  }
}
