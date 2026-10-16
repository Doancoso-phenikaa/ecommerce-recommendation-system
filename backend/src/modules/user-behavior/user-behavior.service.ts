import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../customer/entities/customer.entity.js';
import { UserBehavior } from './entities/user-behavior.entity.js';
import { BehaviorType } from './enums/behavior-type.enum.js';

@Injectable()
export class UserBehaviorService {
  private readonly logger = new Logger(UserBehaviorService.name);

  constructor(
    @InjectRepository(UserBehavior)
    private readonly userBehaviorRepository: Repository<UserBehavior>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
  ) {}

  async recordBehavior(
    customerId: string,
    productId: string,
    behaviorType: BehaviorType,
  ): Promise<void> {
    try {
      await this.userBehaviorRepository.save(
        this.userBehaviorRepository.create({
          customerId,
          productId,
          behaviorType,
        }),
      );
    } catch (error: unknown) {
      this.logFailure(customerId, productId, behaviorType, error);
    }
  }

  async recordViewByUserId(userId: string, productId: string): Promise<void> {
    try {
      const customer = await this.customerRepository.findOneBy({ userId });

      if (!customer) {
        this.logger.warn(
          `Unable to record VIEW behavior: customer profile not found for user ${userId}`,
        );
        return;
      }

      await this.recordBehavior(
        customer.customerId,
        productId,
        BehaviorType.VIEW,
      );
    } catch (error: unknown) {
      this.logFailure('unknown', productId, BehaviorType.VIEW, error);
    }
  }

  private logFailure(
    customerId: string,
    productId: string,
    behaviorType: BehaviorType,
    error: unknown,
  ): void {
    try {
      const errorDetails =
        error instanceof Error ? (error.stack ?? error.message) : String(error);

      this.logger.error(
        `Failed to record ${behaviorType} behavior for customer ${customerId} and product ${productId}`,
        errorDetails,
      );
    } catch {
      return;
    }
  }
}
