import { IsString } from 'class-validator';

/**
 * Raw signup payload (spec 01, requirement 1). Basic shape (all fields present
 * and string-typed) is enforced here; semantic rules — email format, password
 * policy, org-name length/trim — are applied in {@link validateSignup} using the
 * shared validators so client and server agree.
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
}
