import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateReviewDto {
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message: 'orderId must be a positive integer',
  })
  orderId: string;

  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message: 'productId must be a positive integer',
  })
  productId: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
