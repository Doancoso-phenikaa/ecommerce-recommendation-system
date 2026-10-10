import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateCustomerProfileDto {
  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName?: string;

  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(20)
  phone?: string;

  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  shippingAddress?: string;
}
