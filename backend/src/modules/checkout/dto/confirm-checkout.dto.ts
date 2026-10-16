import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ConfirmCheckoutDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  shippingAddress: string;

  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(50)
  shippingMethod?: string;

  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(50)
  discountCode?: string;
}
