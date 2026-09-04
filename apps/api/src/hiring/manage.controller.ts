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
import type { UploadedCv } from './booking.service';
import type { ManageAvailabilityQuery, RescheduleDto } from './manage.service';
import { ManageService } from './manage.service';

/**
 * The product's second public surface, and the only one addressed by a per-booking
 * token (spec 07).
 *
 * No `SessionGuard` and no `OrgScopeGuard`, exactly like `/api/book/{slug}`: the
 * candidate holds a link and possession is the whole precondition. The token carries
 * 128 bits — twice the slug's 72 — because it guards one named person's booking rather
 * than a page meant to be shared, and because no rate limit stands behind it (07 §15).
 *
 * The slug rides in the path beside the token. The token alone would identify the
 * booking, but a token that does not resolve would leave the page with no organization,
 * no vacancy title, and nowhere for its "New booking" button to lead — which is exactly
 * the state this route has to render most often.
 */
@Controller('api/manage')
export class ManageController {
  constructor(private readonly manage: ManageService) {}

  @Get(':slug/:token')
  view(@Param('slug') slug: string, @Param('token') token: string) {
    return this.manage.view(slug, token);
  }

  /**
   * The reschedule picker's times. `404` whenever `GET` would answer `booking: null` —
   * the availability of an interview that cannot be moved is not a fact this route has
   * any business answering with.
   */
  @Get(':slug/:token/availability')
  availability(
    @Param('slug') slug: string,
    @Param('token') token: string,
    @Query() query: ManageAvailabilityQuery,
  ) {
    return this.manage.availabilityFor(slug, token, query);
  }

  @Post(':slug/:token/reschedule')
  @HttpCode(200)
  reschedule(
    @Param('slug') slug: string,
    @Param('token') token: string,
    @Body() dto: RescheduleDto,
  ) {
    return this.manage.reschedule(slug, token, dto);
  }

  @Post(':slug/:token/cancel')
  @HttpCode(200)
  cancel(@Param('slug') slug: string, @Param('token') token: string) {
    return this.manage.cancel(slug, token);
  }

  /**
   * The candidate's own CV, replaced by the candidate and by nobody else — there is no
   * team-side counterpart to this route anywhere in the product (07 §07.37).
   *
   * Unlimited, like everything else behind this token: 07 §15.70 records that a holder
   * of one manage link can upload 10 MB repeatedly and that nothing is ever deleted,
   * rather than implying a limiter exists.
   */
  @Post(':slug/:token/cv')
  @HttpCode(200)
  // Multer's own limit is a memory guard, set above the product rule so an oversized CV
  // still gets the spec's "File is too large" message rather than a bare 413.
  @UseInterceptors(FileInterceptor('cv', { limits: { fileSize: BOOKING_LIMITS.cvMaxBytes * 2 } }))
  replaceCv(
    @Param('slug') slug: string,
    @Param('token') token: string,
    @UploadedFile() cv?: UploadedCv,
  ) {
    return this.manage.replaceCv(slug, token, cv);
  }
}
