import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { SessionPayload } from './session.service';

/** Injects the authenticated {@link SessionPayload} attached by {@link JwtAuthGuard}. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionPayload => {
    const req = context.switchToHttp().getRequest<Request & { user: SessionPayload }>();
    return req.user;
  },
);
