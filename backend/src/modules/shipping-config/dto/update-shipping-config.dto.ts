import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

export class UpdateShippingConfigDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/^\d{1,12}(?:\.\d{1,2})?$/, {
    message:
      'defaultShippingFee must be a non-negative decimal with at most 2 decimal places',
  })
  defaultShippingFee: string;
}
