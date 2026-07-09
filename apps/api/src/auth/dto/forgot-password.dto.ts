import { IsString } from 'class-validator';

/** Forgot-password payload (spec 02, requirement 7). Always answered neutrally. */
export class ForgotPasswordDto {
  @IsString()
  email: string;
}
