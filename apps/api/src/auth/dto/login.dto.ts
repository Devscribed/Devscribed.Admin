import { IsString } from 'class-validator';

/**
 * Login payload (spec 02, requirement 1). Deliberately validates only the shape,
 * not email format — all failures return the same generic error to avoid
 * revealing whether an account exists (requirement 4).
 */
export class LoginDto {
  @IsString()
  email: string;

  @IsString()
  password: string;
}
