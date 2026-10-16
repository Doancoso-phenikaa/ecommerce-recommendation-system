import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { OrderStatus } from '../../order/enums/order-status.enum.js';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AdminOrderQueryDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message: 'shopId must be a positive integer',
  })
  shopId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from must use YYYY-MM-DD format',
  })
  @IsDateString({ strict: true, strictSeparator: true })
  from?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'to must use YYYY-MM-DD format',
  })
  @IsDateString({ strict: true, strictSeparator: true })
  to?: string;

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
