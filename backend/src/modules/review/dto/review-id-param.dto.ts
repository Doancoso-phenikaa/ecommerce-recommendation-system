import { IsString, Matches } from 'class-validator';

export class ReviewIdParamDto {
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message: 'reviewId must be a positive integer',
  })
  reviewId: string;
}
