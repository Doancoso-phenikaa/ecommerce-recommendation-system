import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ProductQueryDto {
  @Transform(trimString)
  @IsOptional()
  @IsString()
  search?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message: 'categoryId must be a positive integer',
  })
  categoryId?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message: 'shopId must be a positive integer',
  })
  shopId?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,10}(?:\.\d{1,2})?$/, {
    message:
      'minPrice must be a non-negative decimal with at most 2 decimal places',
  })
  minPrice?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,10}(?:\.\d{1,2})?$/, {
    message:
      'maxPrice must be a non-negative decimal with at most 2 decimal places',
  })
  maxPrice?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
