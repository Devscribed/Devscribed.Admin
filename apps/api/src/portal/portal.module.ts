import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { PortalEntryService } from './portal-entry.service';
import { PortalFeedService } from './portal-feed.service';
import { PortalHomeService } from './portal-home.service';
import { PortalSettingsService } from './portal-settings.service';

/**
 * Portal spec 01 (Home). `PrismaService` and `SessionService` come from `CoreModule`
 * (global); nothing local is provided here beyond this area's own four services.
 */
@Module({
  controllers: [PortalController],
  providers: [PortalHomeService, PortalFeedService, PortalEntryService, PortalSettingsService],
})
export class PortalModule {}
