import { IsEnum } from 'class-validator';
import { DiscountStatus } from '../enums/discount-status.enum.js';

export class UpdateDiscountStatusDto {
  @IsEnum(DiscountStatus)
  status: DiscountStatus;
}
