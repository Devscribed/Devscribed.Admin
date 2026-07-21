import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SessionService } from './auth/session.service';
import { MembersController } from './members/members.controller';
import { PrismaService } from './prisma.service';
import { SignupController } from './signup/signup.controller';
import { SignupService } from './signup/signup.service';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret',
    }),
  ],
  controllers: [SignupController, MembersController],
  providers: [PrismaService, SignupService, SessionService],
})
export class AppModule {}
