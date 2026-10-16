import { IsString, Matches } from 'class-validator';

export class OrderIdParamDto {
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message: 'orderId must be a positive integer',
  })
  orderId: string;
}
