import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, QueryFailedError, Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { UpdateCategoryStatusDto } from './dto/update-category-status.dto.js';
import { Category } from './entities/category.entity.js';
import { CategoryStatus } from './enums/category-status.enum.js';

const POSTGRES_UNIQUE_VIOLATION = '23505';

interface PostgresDriverError {
  code?: string;
}

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  async createCategory(createCategoryDto: CreateCategoryDto) {
    const name = createCategoryDto.name.trim();

    if (await this.categoryRepository.existsBy({ name })) {
      throw new ConflictException('Category name already exists');
    }

    const category = this.categoryRepository.create({
      name,
      description: createCategoryDto.description?.trim() || null,
      status: CategoryStatus.ACTIVE,
    });

    const savedCategory = await this.saveWithNameConflictHandling(category);
    return this.buildCategoryResponse(savedCategory);
  }

  async getActiveCategories() {
    const categories = await this.categoryRepository.find({
      where: { status: CategoryStatus.ACTIVE },
      order: { name: 'ASC' },
    });

    return categories.map((category) =>
      this.buildCategoryResponse(category),
    );
  }

  async updateCategory(
    categoryId: string,
    updateCategoryDto: UpdateCategoryDto,
  ) {
    const category = await this.findCategoryOrFail(categoryId);

    if (updateCategoryDto.name !== undefined) {
      const name = updateCategoryDto.name.trim();

      if (name !== category.name) {
        const nameExists = await this.categoryRepository.existsBy({
          name,
          categoryId: Not(categoryId),
        });

        if (nameExists) {
          throw new ConflictException('Category name already exists');
        }
      }

      category.name = name;
    }

    if (updateCategoryDto.description !== undefined) {
      category.description = updateCategoryDto.description.trim() || null;
    }

    const savedCategory = await this.saveWithNameConflictHandling(category);
    return this.buildCategoryResponse(savedCategory);
  }

  async updateCategoryStatus(
    categoryId: string,
    updateCategoryStatusDto: UpdateCategoryStatusDto,
  ) {
    const category = await this.findCategoryOrFail(categoryId);
    category.status = updateCategoryStatusDto.status;

    const savedCategory = await this.categoryRepository.save(category);
    return this.buildCategoryResponse(savedCategory);
  }

  private async findCategoryOrFail(categoryId: string): Promise<Category> {
    const category = await this.categoryRepository.findOneBy({ categoryId });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  private async saveWithNameConflictHandling(
    category: Category,
  ): Promise<Category> {
    try {
      return await this.categoryRepository.save(category);
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Category name already exists');
      }

      throw error;
    }
  }

  private buildCategoryResponse(category: Category) {
    return {
      categoryId: category.categoryId,
      name: category.name,
      description: category.description,
      status: category.status,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error.driverError as PostgresDriverError;
    return driverError.code === POSTGRES_UNIQUE_VIOLATION;
  }
}
