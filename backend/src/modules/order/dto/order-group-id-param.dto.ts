import { IsString, Matches } from 'class-validator';

export class OrderGroupIdParamDto {
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message: 'orderGroupId must be a positive integer',
  })
  orderGroupId: string;
}
