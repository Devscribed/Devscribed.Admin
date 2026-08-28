import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
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

  @Post(':slug/:token/cancel')
  @HttpCode(200)
  cancel(@Param('slug') slug: string, @Param('token') token: string) {
    return this.manage.cancel(slug, token);
  }
}
