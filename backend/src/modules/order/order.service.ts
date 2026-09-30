import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Customer } from '../customer/entities/customer.entity.js';
import { Inventory } from '../inventory/entities/inventory.entity.js';
import { Seller } from '../seller/entities/seller.entity.js';
import { Shop } from '../shop/entities/shop.entity.js';
import { ShopStatus } from '../shop/enums/shop-status.enum.js';
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
    @InjectRepository(Seller)
    private readonly sellerRepository: Repository<Seller>,
    @InjectRepository(Shop)
    private readonly shopRepository: Repository<Shop>,
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

  async getSellerOrders(userId: string) {
    const shop = await this.findActiveSellerShop(userId);
    const orders = await this.dataSource.getRepository(Order).find({
      where: { shopId: shop.shopId },
      order: { createdAt: 'DESC', orderId: 'DESC' },
    });

    return {
      data: orders.map((order) => this.buildSellerOrderResponse(order)),
    };
  }

  async getSellerOrderDetail(userId: string, orderId: string) {
    const shop = await this.findActiveSellerShop(userId);
    const order = await this.dataSource
      .getRepository(Order)
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'orderItem')
      .where('order.orderId = :orderId', { orderId })
      .andWhere('order.shopId = :shopId', { shopId: shop.shopId })
      .orderBy('orderItem.orderItemId', 'ASC')
      .getOne();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return {
      ...this.buildSellerOrderResponse(order),
      items: (order.items ?? []).map((orderItem) => ({
        orderItemId: orderItem.orderItemId,
        productId: orderItem.productId,
        productName: orderItem.productName,
        quantity: orderItem.quantity,
        unitPrice: orderItem.unitPrice,
        subtotal: orderItem.subtotal,
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

      await this.updateInventoryForFinalStatus(manager, orderItems, false);

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

  async confirmOrder(userId: string, orderId: string) {
    return this.transitionSellerOrder(
      userId,
      orderId,
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      'Order confirmed successfully',
    );
  }

  async startShipping(userId: string, orderId: string) {
    return this.transitionSellerOrder(
      userId,
      orderId,
      OrderStatus.CONFIRMED,
      OrderStatus.SHIPPING,
      'Order shipping started successfully',
    );
  }

  async completeOrder(userId: string, orderId: string) {
    return this.dataSource.transaction(async (manager) => {
      const shop = await this.findActiveSellerShopInTransaction(
        manager,
        userId,
      );
      const order = await this.findAndLockSellerOrder(
        manager,
        orderId,
        shop.shopId,
      );

      if (order.status !== OrderStatus.SHIPPING) {
        throw new ConflictException('Only shipping orders can be completed');
      }

      const orderItems = await this.findOrderItems(manager, order.orderId);
      await this.updateInventoryForFinalStatus(manager, orderItems, true);

      order.status = OrderStatus.COMPLETED;
      const completedOrder = await manager.getRepository(Order).save(order);

      return this.buildOrderStatusResponse(
        completedOrder,
        'Order completed successfully',
      );
    });
  }

  async cancelOrderBySeller(userId: string, orderId: string) {
    return this.dataSource.transaction(async (manager) => {
      const shop = await this.findActiveSellerShopInTransaction(
        manager,
        userId,
      );
      const order = await this.findAndLockSellerOrder(
        manager,
        orderId,
        shop.shopId,
      );

      if (order.status !== OrderStatus.PENDING) {
        throw new ConflictException('Only pending orders can be cancelled');
      }

      const orderItems = await this.findOrderItems(manager, order.orderId);
      await this.updateInventoryForFinalStatus(manager, orderItems, false);

      order.status = OrderStatus.CANCELLED;
      const cancelledOrder = await manager.getRepository(Order).save(order);

      return this.buildOrderStatusResponse(
        cancelledOrder,
        'Order cancelled successfully',
      );
    });
  }

  private async transitionSellerOrder(
    userId: string,
    orderId: string,
    expectedStatus: OrderStatus,
    nextStatus: OrderStatus,
    successMessage: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const shop = await this.findActiveSellerShopInTransaction(
        manager,
        userId,
      );
      const order = await this.findAndLockSellerOrder(
        manager,
        orderId,
        shop.shopId,
      );

      if (order.status !== expectedStatus) {
        throw new ConflictException(
          `Order must be ${expectedStatus} to change to ${nextStatus}`,
        );
      }

      order.status = nextStatus;
      const savedOrder = await manager.getRepository(Order).save(order);

      return this.buildOrderStatusResponse(savedOrder, successMessage);
    });
  }

  private async findActiveSellerShop(userId: string): Promise<Shop> {
    const seller = await this.sellerRepository.findOneBy({ userId });

    if (!seller) {
      throw new NotFoundException('Seller profile not found');
    }

    const shop = await this.shopRepository.findOneBy({
      sellerId: seller.sellerId,
    });

    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    if (shop.status !== ShopStatus.ACTIVE) {
      throw new ForbiddenException('Shop must be active to manage orders');
    }

    return shop;
  }

  private async findActiveSellerShopInTransaction(
    manager: EntityManager,
    userId: string,
  ): Promise<Shop> {
    const seller = await manager.getRepository(Seller).findOneBy({ userId });

    if (!seller) {
      throw new NotFoundException('Seller profile not found');
    }

    const shop = await manager.getRepository(Shop).findOneBy({
      sellerId: seller.sellerId,
    });

    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    if (shop.status !== ShopStatus.ACTIVE) {
      throw new ForbiddenException('Shop must be active to manage orders');
    }

    return shop;
  }

  private async findAndLockSellerOrder(
    manager: EntityManager,
    orderId: string,
    shopId: string,
  ): Promise<Order> {
    const order = await manager
      .getRepository(Order)
      .createQueryBuilder('order')
      .setLock('pessimistic_write')
      .where('order.orderId = :orderId', { orderId })
      .andWhere('order.shopId = :shopId', { shopId })
      .getOne();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  private async findOrderItems(
    manager: EntityManager,
    orderId: string,
  ): Promise<OrderItem[]> {
    const orderItems = await manager.getRepository(OrderItem).find({
      where: { orderId },
      order: { productId: 'ASC', orderItemId: 'ASC' },
    });

    if (orderItems.length === 0) {
      throw new ConflictException('Order inventory data is inconsistent');
    }

    return orderItems;
  }

  private async updateInventoryForFinalStatus(
    manager: EntityManager,
    orderItems: OrderItem[],
    deductQuantity: boolean,
  ): Promise<void> {
    if (orderItems.length === 0) {
      throw new ConflictException('Order inventory data is inconsistent');
    }

    const quantitiesByProductId = this.sumQuantitiesByProduct(orderItems);
    const inventoriesByProductId = await this.lockInventories(
      manager,
      Array.from(quantitiesByProductId.keys()),
    );

    for (const [productId, orderQuantity] of quantitiesByProductId) {
      const inventory = inventoriesByProductId.get(productId);

      if (
        !inventory ||
        inventory.reservedQuantity < orderQuantity ||
        (deductQuantity && inventory.quantity < orderQuantity)
      ) {
        throw new ConflictException('Order inventory data is inconsistent');
      }

      inventory.reservedQuantity -= orderQuantity;

      if (deductQuantity) {
        inventory.quantity -= orderQuantity;
      }
    }

    await manager
      .getRepository(Inventory)
      .save(Array.from(inventoriesByProductId.values()));
  }

  private buildSellerOrderResponse(order: Order) {
    return {
      orderId: order.orderId,
      orderGroupId: order.orderGroupId,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      shippingFee: order.shippingFee,
      totalAmount: order.totalAmount,
      shippingAddress: order.shippingAddress,
      shippingMethod: order.shippingMethod,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private buildOrderStatusResponse(order: Order, message: string) {
    return {
      orderId: order.orderId,
      status: order.status,
      updatedAt: order.updatedAt,
      message,
    };
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
