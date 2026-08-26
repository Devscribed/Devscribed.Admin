import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BOOKING_LIMITS } from '@devscribed/validation';
import type { AvailabilityQuery, BookingDto, UploadedCv } from './booking.service';
import { BookingService } from './booking.service';

/**
 * The product's only public surface. No `SessionGuard`, no `OrgScopeGuard`: possession
 * of the link is the whole precondition, and the slug carries its own 72 bits of
 * entropy, which is why the URL needs no organization segment.
 *
 * There is deliberately no rate limiting here — see 02 §11, which records the exposure
 * that leaves open rather than implying the endpoint is protected.
 */
@Controller('api/book')
export class BookingController {
  constructor(private readonly booking: BookingService) {}

  @Get(':slug')
  vacancy(@Param('slug') slug: string) {
    return this.booking.publicVacancy(slug);
  }

  @Get(':slug/availability')
  availability(@Param('slug') slug: string, @Query() query: AvailabilityQuery) {
    return this.booking.availabilityFor(slug, query);
  }

  @Post(':slug')
  @HttpCode(201)
  // Multer's own limit is a memory guard, set above the product rule so an oversized
  // CV still gets the spec's "File is too large" message rather than a bare 413.
  @UseInterceptors(FileInterceptor('cv', { limits: { fileSize: BOOKING_LIMITS.cvMaxBytes * 2 } }))
  book(
    @Param('slug') slug: string,
    @Body() dto: BookingDto,
    @UploadedFile() cv?: UploadedCv,
  ) {
    return this.booking.book(slug, dto, cv);
  }
}
