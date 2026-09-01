import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/**
 * Spec reports/01 — Reports module. First vertical slice implements only the
 * Amounts Owed report family (four endpoints — JSON All/My + PDF All/My).
 * `PrismaService`, `SessionService`, and the `PdfRenderer` port come from
 * `CoreModule` (global); nothing local is provided.
 */
@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
