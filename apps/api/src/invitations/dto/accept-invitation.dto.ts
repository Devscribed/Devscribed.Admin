import { IsBoolean, IsOptional, IsString } from 'class-validator';

/**
 * Accept-invitation payload (spec 03). The server picks the new-account vs
 * existing-account variant by whether an account exists for the invite's email;
 * `firstName`/`lastName`/`timezone` are ignored for existing accounts.
 */
export class AcceptInvitationDto {
  @IsString()
  token: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  orgSwitchConfirmed?: boolean;
}
