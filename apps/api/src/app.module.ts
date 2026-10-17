import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DisciplinesModule } from './disciplines/disciplines.module.js';
import { GroupsModule } from './groups/groups.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { StudentsModule } from './students/students.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    SettingsModule,
    AuthModule,
    UsersModule,
    GroupsModule,
    DisciplinesModule,
    StudentsModule,
    HealthModule,
  ],
})
export class AppModule {}
