import { IsString, Matches } from 'class-validator';

export class ProductIdParamDto {
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message: 'productId must be a positive integer',
  })
  productId: string;
}
