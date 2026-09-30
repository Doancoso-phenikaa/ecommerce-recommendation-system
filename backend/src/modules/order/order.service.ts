import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../customer/entities/customer.entity.js';
import { OrderGroup } from './entities/order-group.entity.js';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(OrderGroup)
    private readonly orderGroupRepository: Repository<OrderGroup>,
  ) {}

  async getMyOrders(userId: string) {
    const customer = await this.findCustomerOrFail(userId);
    const orderGroups = await this.orderGroupRepository
      .createQueryBuilder('orderGroup')
      .leftJoinAndSelect('orderGroup.payment', 'payment')
      .leftJoinAndSelect('orderGroup.orders', 'order')
      .leftJoinAndSelect('order.shop', 'shop')
      .where('orderGroup.customerId = :customerId', {
        customerId: customer.customerId,
      })
      .orderBy('orderGroup.createdAt', 'DESC')
      .addOrderBy('orderGroup.orderGroupId', 'DESC')
      .addOrderBy('order.createdAt', 'ASC')
      .addOrderBy('order.orderId', 'ASC')
      .getMany();

    return {
      data: orderGroups.map((orderGroup) => ({
        orderGroupId: orderGroup.orderGroupId,
        totalAmount: orderGroup.totalAmount,
        createdAt: orderGroup.createdAt,
        payment: orderGroup.payment
          ? {
              paymentMethod: orderGroup.payment.paymentMethod,
              status: orderGroup.payment.status,
              paidAt: orderGroup.payment.paidAt,
            }
          : null,
        orders: (orderGroup.orders ?? []).map((order) => ({
          orderId: order.orderId,
          shopId: order.shopId,
          shopName: order.shop.name,
          totalAmount: order.totalAmount,
          status: order.status,
          createdAt: order.createdAt,
        })),
      })),
    };
  }

  async getMyOrderDetail(userId: string, orderGroupId: string) {
    const customer = await this.findCustomerOrFail(userId);
    const orderGroup = await this.orderGroupRepository
      .createQueryBuilder('orderGroup')
      .leftJoinAndSelect('orderGroup.payment', 'payment')
      .leftJoinAndSelect('orderGroup.orders', 'order')
      .leftJoinAndSelect('order.shop', 'shop')
      .leftJoinAndSelect('order.items', 'orderItem')
      .where('orderGroup.orderGroupId = :orderGroupId', { orderGroupId })
      .andWhere('orderGroup.customerId = :customerId', {
        customerId: customer.customerId,
      })
      .orderBy('order.createdAt', 'ASC')
      .addOrderBy('order.orderId', 'ASC')
      .addOrderBy('orderItem.orderItemId', 'ASC')
      .getOne();

    if (!orderGroup) {
      throw new NotFoundException('Order group not found');
    }

    return {
      orderGroupId: orderGroup.orderGroupId,
      totalAmount: orderGroup.totalAmount,
      createdAt: orderGroup.createdAt,
      payment: orderGroup.payment
        ? {
            paymentId: orderGroup.payment.paymentId,
            paymentMethod: orderGroup.payment.paymentMethod,
            amount: orderGroup.payment.amount,
            status: orderGroup.payment.status,
            paidAt: orderGroup.payment.paidAt,
          }
        : null,
      orders: (orderGroup.orders ?? []).map((order) => ({
        orderId: order.orderId,
        shopId: order.shopId,
        shopName: order.shop.name,
        subtotal: order.subtotal,
        discountAmount: order.discountAmount,
        shippingFee: order.shippingFee,
        totalAmount: order.totalAmount,
        shippingAddress: order.shippingAddress,
        shippingMethod: order.shippingMethod,
        status: order.status,
        createdAt: order.createdAt,
        items: (order.items ?? []).map((orderItem) => ({
          orderItemId: orderItem.orderItemId,
          productId: orderItem.productId,
          productName: orderItem.productName,
          quantity: orderItem.quantity,
          unitPrice: orderItem.unitPrice,
          subtotal: orderItem.subtotal,
        })),
      })),
    };
  }

  private async findCustomerOrFail(userId: string): Promise<Customer> {
    const customer = await this.customerRepository.findOneBy({ userId });

    if (!customer) {
      throw new NotFoundException('Customer profile not found');
    }

    return customer;
  }
}
