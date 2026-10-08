import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Order } from '../order/entities/order.entity.js';
import { AdminOrderQueryDto } from './dto/admin-order-query.dto.js';

@Injectable()
export class AdminOrderService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  async getOrders(query: AdminOrderQueryDto) {
    this.validatePeriod(query);
    const { page, limit } = query;
    const orderQuery = this.orderRepository
      .createQueryBuilder('order')
      .innerJoinAndSelect('order.orderGroup', 'orderGroup')
      .innerJoinAndSelect('orderGroup.customer', 'customer')
      .innerJoinAndSelect('customer.user', 'user')
      .innerJoinAndSelect('order.shop', 'shop')
      .leftJoinAndSelect('orderGroup.payment', 'payment')
      .select([
        'order.orderId',
        'order.orderGroupId',
        'order.subtotal',
        'order.discountAmount',
        'order.shippingFee',
        'order.totalAmount',
        'order.shippingMethod',
        'order.status',
        'order.createdAt',
        'order.updatedAt',
        'orderGroup.orderGroupId',
        'customer.customerId',
        'user.userId',
        'user.fullName',
        'user.email',
        'shop.shopId',
        'shop.name',
        'payment.paymentId',
        'payment.paymentMethod',
        'payment.status',
      ]);

    if (query.search) {
      orderQuery.andWhere(
        new Brackets((searchQuery) => {
          searchQuery
            .where('CAST(order.orderId AS TEXT) ILIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('shop.name ILIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('user.fullName ILIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('user.email ILIKE :search', {
              search: `%${query.search}%`,
            });
        }),
      );
    }

    if (query.status !== undefined) {
      orderQuery.andWhere('order.status = :status', { status: query.status });
    }

    if (query.shopId !== undefined) {
      orderQuery.andWhere('order.shopId = :shopId', { shopId: query.shopId });
    }

    if (query.from) {
      orderQuery.andWhere('order.createdAt >= CAST(:from AS date)', {
        from: query.from,
      });
    }

    if (query.to) {
      orderQuery.andWhere(
        "order.createdAt < CAST(:to AS date) + INTERVAL '1 day'",
        { to: query.to },
      );
    }

    const [orders, totalItems] = await orderQuery
      .orderBy('order.createdAt', 'DESC')
      .addOrderBy('order.orderId', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: orders.map((order) => this.buildOrderListResponse(order)),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  async getOrderDetail(orderId: string) {
    const order = await this.orderRepository
      .createQueryBuilder('order')
      .innerJoinAndSelect('order.orderGroup', 'orderGroup')
      .innerJoinAndSelect('orderGroup.customer', 'customer')
      .innerJoinAndSelect('customer.user', 'user')
      .innerJoinAndSelect('order.shop', 'shop')
      .leftJoinAndSelect('orderGroup.payment', 'payment')
      .leftJoinAndSelect('order.items', 'orderItem')
      .select([
        'order.orderId',
        'order.orderGroupId',
        'order.subtotal',
        'order.discountAmount',
        'order.shippingFee',
        'order.totalAmount',
        'order.shippingAddress',
        'order.shippingMethod',
        'order.status',
        'order.createdAt',
        'order.updatedAt',
        'orderGroup.orderGroupId',
        'customer.customerId',
        'user.userId',
        'user.fullName',
        'user.email',
        'user.phone',
        'shop.shopId',
        'shop.name',
        'payment.paymentId',
        'payment.paymentMethod',
        'payment.amount',
        'payment.status',
        'payment.paidAt',
        'orderItem.orderItemId',
        'orderItem.productId',
        'orderItem.productName',
        'orderItem.quantity',
        'orderItem.unitPrice',
        'orderItem.subtotal',
      ])
      .where('order.orderId = :orderId', { orderId })
      .orderBy('orderItem.orderItemId', 'ASC')
      .getOne();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return this.buildOrderDetailResponse(order);
  }

  private validatePeriod(query: AdminOrderQueryDto): void {
    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException('from must be earlier than or equal to to');
    }
  }

  private buildOrderListResponse(order: Order) {
    return {
      orderId: order.orderId,
      orderGroupId: order.orderGroupId,
      shop: {
        shopId: order.shop.shopId,
        name: order.shop.name,
      },
      customer: {
        customerId: order.orderGroup.customer.customerId,
        fullName: order.orderGroup.customer.user.fullName,
        email: order.orderGroup.customer.user.email,
      },
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      shippingFee: order.shippingFee,
      totalAmount: order.totalAmount,
      shippingMethod: order.shippingMethod,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      payment: order.orderGroup.payment
        ? {
            paymentMethod: order.orderGroup.payment.paymentMethod,
            status: order.orderGroup.payment.status,
          }
        : null,
    };
  }

  private buildOrderDetailResponse(order: Order) {
    return {
      orderId: order.orderId,
      orderGroupId: order.orderGroupId,
      customer: {
        customerId: order.orderGroup.customer.customerId,
        fullName: order.orderGroup.customer.user.fullName,
        email: order.orderGroup.customer.user.email,
        phone: order.orderGroup.customer.user.phone,
      },
      shop: {
        shopId: order.shop.shopId,
        name: order.shop.name,
      },
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      shippingFee: order.shippingFee,
      totalAmount: order.totalAmount,
      shippingAddress: order.shippingAddress,
      shippingMethod: order.shippingMethod,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      payment: order.orderGroup.payment
        ? {
            paymentId: order.orderGroup.payment.paymentId,
            paymentMethod: order.orderGroup.payment.paymentMethod,
            amount: order.orderGroup.payment.amount,
            status: order.orderGroup.payment.status,
            paidAt: order.orderGroup.payment.paidAt,
          }
        : null,
      items: (order.items ?? []).map((item) => ({
        orderItemId: item.orderItemId,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      })),
    };
  }
}
