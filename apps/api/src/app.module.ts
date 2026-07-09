import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { MembersModule } from './members/members.module';

@Module({
  imports: [DatabaseModule, AuthModule, MembersModule],
  controllers: [HealthController],
})
export class AppModule {}
