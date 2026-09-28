import { IsString, Matches } from 'class-validator';

export class ShopIdParamDto {
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message: 'shopId must be a positive integer',
  })
  shopId: string;
}
