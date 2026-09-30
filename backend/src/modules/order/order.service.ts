import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Customer } from '../customer/entities/customer.entity.js';
import { Inventory } from '../inventory/entities/inventory.entity.js';
import { OrderGroup } from './entities/order-group.entity.js';
import { OrderItem } from './entities/order-item.entity.js';
import { Order } from './entities/order.entity.js';
import { OrderStatus } from './enums/order-status.enum.js';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(OrderGroup)
    private readonly orderGroupRepository: Repository<OrderGroup>,
    private readonly dataSource: DataSource,
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

  async cancelMyOrder(userId: string, orderId: string) {
    return this.dataSource.transaction(async (manager) => {
      const customer = await manager
        .getRepository(Customer)
        .findOneBy({ userId });

      if (!customer) {
        throw new NotFoundException('Customer profile not found');
      }

      const order = await manager
        .getRepository(Order)
        .createQueryBuilder('order')
        .innerJoin('order.orderGroup', 'orderGroup')
        .setLock('pessimistic_write')
        .where('order.orderId = :orderId', { orderId })
        .andWhere('orderGroup.customerId = :customerId', {
          customerId: customer.customerId,
        })
        .getOne();

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (order.status !== OrderStatus.PENDING) {
        throw new ConflictException('Only pending orders can be cancelled');
      }

      const orderItems = await manager.getRepository(OrderItem).find({
        where: { orderId: order.orderId },
        order: { productId: 'ASC', orderItemId: 'ASC' },
      });

      if (orderItems.length === 0) {
        throw new ConflictException('Order inventory data is inconsistent');
      }

      const quantitiesByProductId = this.sumQuantitiesByProduct(orderItems);
      const inventoriesByProductId = await this.lockInventories(
        manager,
        Array.from(quantitiesByProductId.keys()),
      );

      for (const [productId, quantityToRelease] of quantitiesByProductId) {
        const inventory = inventoriesByProductId.get(productId);

        if (!inventory || inventory.reservedQuantity < quantityToRelease) {
          throw new ConflictException('Order inventory data is inconsistent');
        }

        inventory.reservedQuantity -= quantityToRelease;
      }

      await manager
        .getRepository(Inventory)
        .save(Array.from(inventoriesByProductId.values()));

      order.status = OrderStatus.CANCELLED;
      const cancelledOrder = await manager.getRepository(Order).save(order);

      return {
        orderId: cancelledOrder.orderId,
        status: cancelledOrder.status,
        updatedAt: cancelledOrder.updatedAt,
        message: 'Order cancelled successfully',
      };
    });
  }

  private sumQuantitiesByProduct(orderItems: OrderItem[]): Map<string, number> {
    const quantitiesByProductId = new Map<string, number>();

    for (const orderItem of orderItems) {
      quantitiesByProductId.set(
        orderItem.productId,
        (quantitiesByProductId.get(orderItem.productId) ?? 0) +
          orderItem.quantity,
      );
    }

    return quantitiesByProductId;
  }

  private async lockInventories(
    manager: EntityManager,
    productIds: string[],
  ): Promise<Map<string, Inventory>> {
    const sortedProductIds = [...productIds].sort((left, right) =>
      BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0,
    );
    const inventories = await manager
      .getRepository(Inventory)
      .createQueryBuilder('inventory')
      .setLock('pessimistic_write')
      .where('inventory.productId IN (:...productIds)', {
        productIds: sortedProductIds,
      })
      .orderBy('inventory.productId', 'ASC')
      .getMany();

    return new Map(
      inventories.map((inventory) => [inventory.productId, inventory]),
    );
  }

  private async findCustomerOrFail(userId: string): Promise<Customer> {
    const customer = await this.customerRepository.findOneBy({ userId });

    if (!customer) {
      throw new NotFoundException('Customer profile not found');
    }

    return customer;
  }
}
