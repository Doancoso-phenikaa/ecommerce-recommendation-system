import { IsEnum, IsOptional } from 'class-validator';

export enum SellerStatisticsRange {
  SEVEN_DAYS = '7d',
  THIRTY_DAYS = '30d',
}

export class SellerStatisticsQueryDto {
  @IsOptional()
  @IsEnum(SellerStatisticsRange)
  range: SellerStatisticsRange = SellerStatisticsRange.SEVEN_DAYS;
}
