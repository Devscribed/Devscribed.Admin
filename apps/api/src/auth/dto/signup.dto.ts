import { IsOptional, IsString } from 'class-validator';

/**
 * Raw signup payload (spec 01). Basic shape (fields present and string-typed) is
 * enforced here; semantic rules — email/name/password/org validation and their
 * exact messages — are applied in {@link validateSignup} using the shared
 * validators so client and server agree.
 */
export class SignupDto {
  @IsString()
  orgName: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  email: string;

  @IsString()
  password: string;

  /** IANA timezone auto-detected by the browser (optional; defaults to UTC). */
  @IsOptional()
  @IsString()
  timezone?: string;
}
