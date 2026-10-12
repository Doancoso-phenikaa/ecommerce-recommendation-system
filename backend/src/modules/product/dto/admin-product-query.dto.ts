import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ProductStatus } from '../enums/product-status.enum.js';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AdminProductQueryDto {
  @Transform(trimString)
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

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
