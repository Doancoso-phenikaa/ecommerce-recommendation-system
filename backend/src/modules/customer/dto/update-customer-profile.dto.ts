import { IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateCustomerProfileDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  shippingAddress?: string;
}
