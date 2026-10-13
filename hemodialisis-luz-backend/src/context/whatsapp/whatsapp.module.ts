import { forwardRef, Module } from '@nestjs/common';
import { SessionModule } from 'src/app/sesion/sesion.module';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [forwardRef(() => SessionModule)],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
