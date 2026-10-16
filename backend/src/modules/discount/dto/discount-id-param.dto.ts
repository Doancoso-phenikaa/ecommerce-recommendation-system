import { IsString, Matches } from 'class-validator';

export class DiscountIdParamDto {
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message: 'discountId must be a positive integer',
  })
  discountId: string;
}
