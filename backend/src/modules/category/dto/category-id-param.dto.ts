import { IsString, Matches } from 'class-validator';

export class CategoryIdParamDto {
  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message: 'categoryId must be a positive integer',
  })
  categoryId: string;
}
