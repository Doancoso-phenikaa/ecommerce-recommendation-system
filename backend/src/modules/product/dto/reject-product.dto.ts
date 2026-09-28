import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

export class RejectProductDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  rejectionReason: string;
}
