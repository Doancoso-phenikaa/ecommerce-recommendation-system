import { IsEnum } from 'class-validator';
import { CategoryStatus } from '../enums/category-status.enum.js';

export class UpdateCategoryStatusDto {
  @IsEnum(CategoryStatus)
  status: CategoryStatus;
}
