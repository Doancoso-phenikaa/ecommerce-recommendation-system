import { IsEnum, IsOptional } from 'class-validator';

export enum AdminStatisticsRange {
  SEVEN_DAYS = '7d',
  THIRTY_DAYS = '30d',
}

export class AdminStatisticsRangeQueryDto {
  @IsOptional()
  @IsEnum(AdminStatisticsRange)
  range: AdminStatisticsRange = AdminStatisticsRange.SEVEN_DAYS;
}
