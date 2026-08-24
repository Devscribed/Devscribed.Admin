import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { DeclineDto, SignDto } from '../documents/envelopes.dto';
import { SigningRateLimitGuard } from './signing-rate-limit.guard';
import { SigningService } from './signing.service';

/**
 * The public signing surface — the first route in the application with no session at all.
 *
 * What is deliberately absent is the point of the file: no `SessionGuard`, no
 * `OrgScopeGuard`, no `CapabilityGuard`, no cookie read and no cookie written. A signer
 * who happens to be a member gets nothing from their session here; authorization is the
 * token and only the token. The one guard is the per-IP rate limiter, because this is
 * also the first surface anyone on the internet can reach.
 */
@Controller('api/sign')
@UseGuards(SigningRateLimitGuard)
export class SigningController {
  constructor(private readonly signing: SigningService) {}

  @Get(':token')
  view(@Param('token') token: string, @Req() req: Request) {
    return this.signing.view(token, req);
  }

  @Post(':token/view')
  @HttpCode(204)
  markViewed(@Param('token') token: string, @Req() req: Request) {
    return this.signing.markViewed(token, req);
  }

  @Post(':token/sign')
  @HttpCode(200)
  sign(@Param('token') token: string, @Body() dto: SignDto, @Req() req: Request) {
    return this.signing.sign(token, dto, req);
  }

  @Post(':token/decline')
  @HttpCode(200)
  decline(@Param('token') token: string, @Body() dto: DeclineDto, @Req() req: Request) {
    return this.signing.decline(token, dto, req);
  }

  @Get(':token/document')
  document(@Param('token') token: string, @Req() req: Request) {
    return this.signing.document(token, req);
  }

  /** Requirement 35 — records the request. It never issues a token by itself. */
  @Post(':token/request-new-link')
  @HttpCode(204)
  requestNewLink(@Param('token') token: string, @Req() req: Request) {
    return this.signing.requestNewLink(token, req);
  }
}
