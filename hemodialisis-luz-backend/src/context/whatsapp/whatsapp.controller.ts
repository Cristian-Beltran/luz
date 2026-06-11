import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/context/shared/guards/jwt-auth.guard';
import { WhatsAppService } from './whatsapp.service';

@UseGuards(JwtAuthGuard)
@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsAppService: WhatsAppService) {}

  @Get('status')
  getStatus() {
    return this.whatsAppService.getStatus();
  }

  @Post('restart')
  async restart() {
    await this.whatsAppService.restart();
    return this.whatsAppService.getStatus();
  }

  @Post('sessions/:id/report')
  async sendSessionReport(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return {
      ok: await this.whatsAppService.sendSessionReport(id),
    };
  }
}
