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

export class UpdateDiscountDto {
  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(DiscountType)
  type?: DiscountType;

  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^(?=.*[1-9])\d{1,10}(?:\.\d{1,2})?$/, {
    message: 'value must be a positive decimal with at most 2 decimal places',
  })
  value?: string;

  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^\d{1,12}(?:\.\d{1,2})?$/, {
    message:
      'minOrderAmount must be a non-negative decimal with at most 2 decimal places',
  })
  minOrderAmount?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString()
  startDate?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString()
  endDate?: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsInt()
  @Min(1)
  usageLimit?: number | null;
}
