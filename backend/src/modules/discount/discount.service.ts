import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, QueryFailedError, Repository } from 'typeorm';
import { CreateDiscountDto } from './dto/create-discount.dto.js';
import { UpdateDiscountStatusDto } from './dto/update-discount-status.dto.js';
import { UpdateDiscountDto } from './dto/update-discount.dto.js';
import { Discount } from './entities/discount.entity.js';
import { DiscountStatus } from './enums/discount-status.enum.js';
import { DiscountType } from './enums/discount-type.enum.js';

const POSTGRES_UNIQUE_VIOLATION = '23505';

interface PostgresDriverError {
  code?: string;
}

interface DiscountBusinessValues {
  type: DiscountType;
  value: string;
  startDate: Date;
  endDate: Date;
  usageLimit: number | null;
  usedCount: number;
}

@Injectable()
export class DiscountService {
  constructor(
    @InjectRepository(Discount)
    private readonly discountRepository: Repository<Discount>,
  ) {}

  async createDiscount(createDiscountDto: CreateDiscountDto) {
    const code = this.normalizeCode(createDiscountDto.code);

    if (await this.discountRepository.existsBy({ code })) {
      throw new ConflictException('Discount code already exists');
    }

    const values: DiscountBusinessValues = {
      type: createDiscountDto.type,
      value: createDiscountDto.value,
      startDate: new Date(createDiscountDto.startDate),
      endDate: new Date(createDiscountDto.endDate),
      usageLimit: createDiscountDto.usageLimit ?? null,
      usedCount: 0,
    };
    this.validateBusinessRules(values);

    const discount = this.discountRepository.create({
      code,
      type: values.type,
      value: values.value,
      minOrderAmount: createDiscountDto.minOrderAmount ?? '0',
      startDate: values.startDate,
      endDate: values.endDate,
      usageLimit: values.usageLimit,
      usedCount: 0,
      status: DiscountStatus.ACTIVE,
    });

    const savedDiscount = await this.saveWithCodeConflictHandling(discount);
    return this.buildDiscountResponse(savedDiscount);
  }

  async getDiscounts() {
    const discounts = await this.discountRepository.find({
      order: { createdAt: 'DESC' },
    });

    return discounts.map((discount) => this.buildDiscountResponse(discount));
  }

  async updateDiscount(
    discountId: string,
    updateDiscountDto: UpdateDiscountDto,
  ) {
    const discount = await this.findDiscountOrFail(discountId);

    if (updateDiscountDto.code !== undefined) {
      const code = this.normalizeCode(updateDiscountDto.code);

      if (
        code !== discount.code &&
        (await this.discountRepository.existsBy({
          code,
          discountId: Not(discountId),
        }))
      ) {
        throw new ConflictException('Discount code already exists');
      }

      discount.code = code;
    }

    const values: DiscountBusinessValues = {
      type: updateDiscountDto.type ?? discount.type,
      value: updateDiscountDto.value ?? discount.value,
      startDate:
        updateDiscountDto.startDate !== undefined
          ? new Date(updateDiscountDto.startDate)
          : discount.startDate,
      endDate:
        updateDiscountDto.endDate !== undefined
          ? new Date(updateDiscountDto.endDate)
          : discount.endDate,
      usageLimit:
        updateDiscountDto.usageLimit !== undefined
          ? updateDiscountDto.usageLimit
          : discount.usageLimit,
      usedCount: discount.usedCount,
    };
    this.validateBusinessRules(values);

    discount.type = values.type;
    discount.value = values.value;
    discount.startDate = values.startDate;
    discount.endDate = values.endDate;
    discount.usageLimit = values.usageLimit;

    if (updateDiscountDto.minOrderAmount !== undefined) {
      discount.minOrderAmount = updateDiscountDto.minOrderAmount;
    }

    const savedDiscount = await this.saveWithCodeConflictHandling(discount);
    return this.buildDiscountResponse(savedDiscount);
  }

  async updateDiscountStatus(
    discountId: string,
    updateDiscountStatusDto: UpdateDiscountStatusDto,
  ) {
    const discount = await this.findDiscountOrFail(discountId);
    discount.status = updateDiscountStatusDto.status;

    const savedDiscount = await this.discountRepository.save(discount);
    return this.buildDiscountResponse(savedDiscount);
  }

  private async findDiscountOrFail(discountId: string): Promise<Discount> {
    const discount = await this.discountRepository.findOneBy({ discountId });

    if (!discount) {
      throw new NotFoundException('Discount not found');
    }

    return discount;
  }

  private validateBusinessRules(values: DiscountBusinessValues): void {
    if (
      values.type === DiscountType.PERCENT &&
      this.decimalToCents(values.value) > 10_000n
    ) {
      throw new BadRequestException(
        'Percentage discount value must not exceed 100',
      );
    }

    if (values.endDate.getTime() <= values.startDate.getTime()) {
      throw new BadRequestException('endDate must be later than startDate');
    }

    if (values.usageLimit !== null && values.usedCount > values.usageLimit) {
      throw new BadRequestException('usageLimit cannot be less than usedCount');
    }
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private decimalToCents(value: string): bigint {
    const [wholePart, fractionPart = ''] = value.split('.');
    return BigInt(wholePart) * 100n + BigInt(fractionPart.padEnd(2, '0'));
  }

  private async saveWithCodeConflictHandling(
    discount: Discount,
  ): Promise<Discount> {
    try {
      return await this.discountRepository.save(discount);
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Discount code already exists');
      }

      throw error;
    }
  }

  private buildDiscountResponse(discount: Discount) {
    return {
      discountId: discount.discountId,
      code: discount.code,
      type: discount.type,
      value: discount.value,
      minOrderAmount: discount.minOrderAmount,
      startDate: discount.startDate,
      endDate: discount.endDate,
      usageLimit: discount.usageLimit,
      usedCount: discount.usedCount,
      status: discount.status,
      createdAt: discount.createdAt,
      updatedAt: discount.updatedAt,
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
