import { IsString } from 'class-validator';

/** Invite payload (spec 03). Semantic validation happens in the service. */
export class CreateInvitationDto {
  @IsString()
  email: string;

  @IsString()
  role: string;
}
