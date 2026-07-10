import { IsOptional, IsString } from 'class-validator';

/** Reset-password payload (spec 02, requirements 9–11). */
export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  password: string;

  /** Must match `password` (spec 02, requirement 10). */
  @IsOptional()
  @IsString()
  passwordConfirmation?: string;
}
