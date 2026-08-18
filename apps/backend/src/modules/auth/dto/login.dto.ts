import { Transform } from "class-transformer";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  // Emails are stored lowercased; normalizing here means the service never has to
  // remember to, and a stray trailing space can't cause a bogus 401.
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: "A valid email address is required" })
  email!: string;

  @IsString()
  @MinLength(8, { message: "Password must be at least 8 characters" })
  @MaxLength(128)
  password!: string;
}
