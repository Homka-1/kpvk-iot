import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DiagnosticsModule } from './diagnostics/diagnostics.module.js';
import { DisciplinesModule } from './disciplines/disciplines.module.js';
import { GroupsModule } from './groups/groups.module.js';
import { HealthModule } from './health/health.module.js';
import { LibraryModule } from './library/library.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProfilesModule } from './profiles/profiles.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { StudentsModule } from './students/students.module.js';
import { StudentAssignmentsModule } from './assignments/student-assignments.module.js';
import { TrajectoriesModule } from './trajectories/trajectories.module.js';
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
    DiagnosticsModule,
    ProfilesModule,
    LibraryModule,
    TrajectoriesModule,
    StudentAssignmentsModule,
    HealthModule,
  ],
})
export class AppModule {}
