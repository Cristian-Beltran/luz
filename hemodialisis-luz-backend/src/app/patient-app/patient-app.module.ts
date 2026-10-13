import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/context/auth/auth.module';
import { SessionModule } from 'src/app/sesion/sesion.module';
import { UsersModule } from 'src/app/users/user.module';
import { Patient } from 'src/app/users/entities/patient.entity';
import { FamilyMember } from 'src/app/users/entities/family.entity';
import { PatientAppController } from './patient-app.controller';
import { PatientAppService } from './patient-app.service';
import { UserTypeGuard } from 'src/context/shared/guards/type-user.guard';
import { FamilyAppController } from './family-app.controller';
import { FamilyAppService } from './family-app.service';

@Module({
  imports: [TypeOrmModule.forFeature([Patient, FamilyMember]), AuthModule, UsersModule, SessionModule],
  controllers: [PatientAppController, FamilyAppController],
  providers: [PatientAppService, FamilyAppService, UserTypeGuard],
})
export class PatientAppModule {}
