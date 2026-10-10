import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Not, QueryFailedError } from 'typeorm';
import { Customer } from '../customer/entities/customer.entity.js';
import { OrderGroup } from '../order/entities/order-group.entity.js';
import { Order } from '../order/entities/order.entity.js';
import { OrderStatus } from '../order/enums/order-status.enum.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { Payment } from './entities/payment.entity.js';
import { PaymentMethod } from './enums/payment-method.enum.js';
import { PaymentStatus } from './enums/payment-status.enum.js';

const POSTGRES_UNIQUE_VIOLATION = '23505';

interface PostgresDriverError {
  code?: string;
}

@Injectable()
export class PaymentService {
  constructor(private readonly dataSource: DataSource) {}

  async createPayment(userId: string, createPaymentDto: CreatePaymentDto) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const customer = await manager
          .getRepository(Customer)
          .findOneBy({ userId });

        if (!customer) {
          throw new NotFoundException('Customer profile not found');
        }

        const orderGroup = await manager
          .getRepository(OrderGroup)
          .createQueryBuilder('orderGroup')
          .setLock('pessimistic_write')
          .where('orderGroup.orderGroupId = :orderGroupId', {
            orderGroupId: createPaymentDto.orderGroupId,
          })
          .getOne();

        if (!orderGroup) {
          throw new NotFoundException('Order group not found');
        }

        if (orderGroup.customerId !== customer.customerId) {
          throw new ForbiddenException(
            'Order group does not belong to current customer',
          );
        }

        const paymentRepository = manager.getRepository(Payment);
        const paymentExists = await paymentRepository.existsBy({
          orderGroupId: orderGroup.orderGroupId,
        });

        if (paymentExists) {
          throw new ConflictException('Order group already has a payment');
        }

        const hasNonCancelledOrder = await manager
          .getRepository(Order)
          .existsBy({
            orderGroupId: orderGroup.orderGroupId,
            status: Not(OrderStatus.CANCELLED),
          });

        if (
          this.isZeroAmount(orderGroup.totalAmount) ||
          !hasNonCancelledOrder
        ) {
          throw new ConflictException(
            'Cannot create payment for a fully cancelled order group',
          );
        }

        const isOnline =
          createPaymentDto.paymentMethod === PaymentMethod.ONLINE;
        const payment = await paymentRepository.save(
          paymentRepository.create({
            orderGroupId: orderGroup.orderGroupId,
            paymentMethod: createPaymentDto.paymentMethod,
            amount: orderGroup.totalAmount,
            status: isOnline ? PaymentStatus.PAID : PaymentStatus.PENDING,
            paidAt: isOnline ? new Date() : null,
          }),
        );

        return this.buildPaymentResponse(payment);
      });
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Order group already has a payment');
      }

      throw error;
    }
  }

  private buildPaymentResponse(payment: Payment) {
    return {
      paymentId: payment.paymentId,
      orderGroupId: payment.orderGroupId,
      paymentMethod: payment.paymentMethod,
      amount: payment.amount,
      status: payment.status,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error.driverError as PostgresDriverError;
    return driverError.code === POSTGRES_UNIQUE_VIOLATION;
  }

  private isZeroAmount(amount: string): boolean {
    return /^0+(?:\.0+)?$/.test(amount.trim());
  }
}
