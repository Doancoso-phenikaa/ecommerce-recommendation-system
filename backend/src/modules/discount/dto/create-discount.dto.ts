import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { DiscountType } from '../enums/discount-type.enum.js';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateDiscountDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @IsEnum(DiscountType)
  type: DiscountType;

  @Transform(trimString)
  @IsString()
  @Matches(/^(?=.*[1-9])\d{1,10}(?:\.\d{1,2})?$/, {
    message: 'value must be a positive decimal with at most 2 decimal places',
  })
  value: string;

  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^\d{1,12}(?:\.\d{1,2})?$/, {
    message:
      'minOrderAmount must be a non-negative decimal with at most 2 decimal places',
  })
  minOrderAmount?: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  usageLimit?: number;
}
