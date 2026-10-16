import { IsEnum, IsString, Matches } from 'class-validator';
import { PaymentMethod } from '../enums/payment-method.enum.js';

export class CreatePaymentDto {
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message: 'orderGroupId must be a positive integer',
  })
  orderGroupId: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;
}
