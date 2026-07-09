import { IsString } from 'class-validator';

/** Reset-password payload (spec 02, requirements 8–9). */
export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  password: string;
}
