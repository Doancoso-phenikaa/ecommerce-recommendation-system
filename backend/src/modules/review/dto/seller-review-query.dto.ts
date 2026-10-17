import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SellerReviewQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message: 'productId must be a positive integer',
  })
  productId?: string;
}
