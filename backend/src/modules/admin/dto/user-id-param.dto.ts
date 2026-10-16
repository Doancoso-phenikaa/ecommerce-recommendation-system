import { IsString, Matches } from 'class-validator';

export class UserIdParamDto {
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message: 'userId must be a positive integer',
  })
  userId: string;
}
