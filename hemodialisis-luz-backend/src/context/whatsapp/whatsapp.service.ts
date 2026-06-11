import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as QRCode from 'qrcode';
import {
  Client,
  LocalAuth,
  MessageMedia,
  type ClientInfo,
} from 'whatsapp-web.js';
import { SessionService } from 'src/app/sesion/services/session.service';
import { SessionReportService } from 'src/app/sesion/services/session-report.service';

type WhatsAppStatus =
  | 'initializing'
  | 'waiting_qr'
  | 'connected'
  | 'disconnected'
  | 'error';

@Injectable()
export class WhatsAppService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppService.name);
  private client: Client | null = null;
  private status: WhatsAppStatus = 'initializing';
  private qrDataUrl: string | null = null;
  private lastError: string | null = null;
  private currentUser: string | null = null;
  private started = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly sessionService: SessionService,
    private readonly sessionReportService: SessionReportService,
  ) {}

  async onModuleInit() {
    await this.initializeClient();
  }

  async onModuleDestroy() {
    await this.client?.destroy();
  }

  getStatus() {
    return {
      status: this.status,
      qrDataUrl: this.qrDataUrl,
      currentUser: this.currentUser,
      lastError: this.lastError,
      ready: this.status === 'connected',
    };
  }

  async restart() {
    this.status = 'initializing';
    this.qrDataUrl = null;
    this.lastError = null;
    this.currentUser = null;

    if (this.client) {
      await this.client.destroy();
      this.client = null;
    }

    this.started = false;
    await this.initializeClient();
  }

  async sendSessionReport(sessionId: string): Promise<boolean> {
    try {
      if (this.status !== 'connected' || !this.client) {
        this.logger.warn('WhatsApp no conectado, no se envio reporte');
        return false;
      }

      const session = await this.sessionService.findOneDetailed(sessionId);
      if (!session) {
        this.logger.warn(`Sesion ${sessionId} no encontrada para envio`);
        return false;
      }

      const phone = this.normalizePhone(session.patient.referencePhone);
      if (!phone) {
        this.logger.warn(`Telefono de referencia invalido para sesion ${sessionId}`);
        return false;
      }

      const report = await this.sessionReportService.generateSessionReport(session.id);
      const media = new MessageMedia(
        'application/pdf',
        report.buffer.toString('base64'),
        report.fileName,
      );

      await this.client.sendMessage(phone, media, {
        sendMediaAsDocument: true,
        caption: `Reporte clinico de la sesion de ${session.patient.user.fullname}`,
      });

      this.logger.log(`Reporte de sesion enviado por WhatsApp a ${phone}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`No se pudo enviar reporte de sesion ${sessionId}: ${message}`);
      return false;
    }
  }

  private async initializeClient() {
    if (this.started) return;
    this.started = true;

    const client = new Client({
      authStrategy: new LocalAuth({ clientId: 'luz-doctor' }),
      puppeteer: {
        headless: true,
        executablePath: '/usr/bin/google-chrome-stable',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    client.on('qr', async (qr) => {
      this.status = 'waiting_qr';
      this.qrDataUrl = await QRCode.toDataURL(qr);
      this.logger.log('WhatsApp QR generado');
    });

    client.on('ready', () => {
      this.status = 'connected';
      this.qrDataUrl = null;
      this.lastError = null;
      this.currentUser = this.extractUserId(client.info);
      this.logger.log('WhatsApp conectado');
    });

    client.on('authenticated', () => {
      this.status = 'initializing';
      this.lastError = null;
      this.logger.log('WhatsApp autenticado');
    });

    client.on('auth_failure', (message) => {
      this.status = 'error';
      this.lastError = message;
      this.logger.error(`WhatsApp auth failure: ${message}`);
    });

    client.on('disconnected', (reason) => {
      this.status = 'disconnected';
      this.currentUser = null;
      this.lastError = String(reason);
      this.logger.warn(`WhatsApp desconectado: ${reason}`);
    });

    this.client = client;

    try {
      await client.initialize();
    } catch (error) {
      this.status = 'error';
      this.lastError = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`No se pudo inicializar WhatsApp: ${this.lastError}`);
    }
  }

  private extractUserId(info?: ClientInfo | null): string | null {
    const raw = info?.wid?._serialized;
    return typeof raw === 'string' ? raw : null;
  }

  private normalizePhone(phone: string | undefined): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (!digits) return null;

    const defaultCountryCode =
      this.configService.get<string>('config.whatsAppDefaultCountryCode') ?? '57';
    const normalized = digits.length <= 10 ? `${defaultCountryCode}${digits}` : digits;
    return `${normalized}@c.us`;
  }
}
