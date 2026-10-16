import { IsInt, IsString, Matches, Min } from 'class-validator';

export class AddCartItemDto {
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message: 'productId must be a positive integer',
  })
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}
