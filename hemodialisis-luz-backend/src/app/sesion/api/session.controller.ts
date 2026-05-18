// src/app/session/session.controller.ts
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { UserType } from 'src/app/users/enums/user-type';
import { UserPayload } from 'src/context/shared/decorators/user.decorator';
import { UserTypes } from 'src/context/shared/decorators/type-user.decorator';
import { JwtAuthGuard } from 'src/context/shared/guards/jwt-auth.guard';
import { UserTypeGuard } from 'src/context/shared/guards/type-user.guard';
import { PayloadToken } from 'src/context/shared/models/token.model';
import { SessionService } from '../services/session.service';
import { CreateSessionDto } from '../dtos/create-session.dto';
import { CreateSessionDataDto } from '../dtos/create-session-data.dto';

@Controller('sessions')
@UseGuards(JwtAuthGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  // POST /sessions  -> crea una sesión
  @Post()
  createSession(@Body() dto: CreateSessionDto) {
    return this.sessionService.createSession(dto);
  }

  // POST /sessions/:id/data -> agrega una fila de datos a la sesión
  @Post(':id/data')
  addData(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CreateSessionDataDto,
  ) {
    return this.sessionService.addSessionData(id, dto);
  }

  @Patch(':id/close')
  closeSession(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.sessionService.closeSession(id);
  }

  @Get()
  getAll() {
    return this.sessionService.getAll();
  }

  @Get('by-patient/:patientId')
  findByPatient(
    @UserPayload() user: PayloadToken,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
  ) {
    if (user.type === UserType.PATIENT) {
      return this.sessionService
        .findPatientByUserId(user.sub)
        .then((patient) => {
          if (patient.id !== patientId) {
            throw new ForbiddenException('Not allowed to access this patient');
          }
          return this.sessionService.findByPatient(patientId);
        });
    }
    return this.sessionService.findByPatient(patientId);
  }

  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes(UserType.PATIENT)
  @Get('me/status')
  getMyStatus(@UserPayload() user: PayloadToken) {
    return this.sessionService.getPatientOwnStatus(user.sub);
  }

  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes(UserType.PATIENT)
  @Get('me')
  getMySessions(@UserPayload() user: PayloadToken) {
    return this.sessionService.getPatientOwnSessions(user.sub);
  }
}
