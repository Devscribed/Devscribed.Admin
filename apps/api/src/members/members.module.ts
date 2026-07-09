import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Membership } from '../entities/membership.entity';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

@Module({
  imports: [TypeOrmModule.forFeature([Membership]), AuthModule],
  controllers: [MembersController],
  providers: [MembersService],
})
export class MembersModule {}
