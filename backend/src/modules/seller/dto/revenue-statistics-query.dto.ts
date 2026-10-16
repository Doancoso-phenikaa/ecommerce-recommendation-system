import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RevenueStatisticsQueryDto {
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
}
