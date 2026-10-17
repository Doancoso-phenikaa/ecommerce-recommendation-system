import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../customer/entities/customer.entity.js';
import { Order } from '../order/entities/order.entity.js';
import { OrderItem } from '../order/entities/order-item.entity.js';
import { OrderStatus } from '../order/enums/order-status.enum.js';
import { Product } from '../product/entities/product.entity.js';
import { Seller } from '../seller/entities/seller.entity.js';
import { Shop } from '../shop/entities/shop.entity.js';
import { User } from '../user/entities/user.entity.js';
import { AdminStatisticsQueryDto } from './dto/admin-statistics-query.dto.js';
import {
  AdminStatisticsRange,
  AdminStatisticsRangeQueryDto,
} from './dto/admin-statistics-range-query.dto.js';

interface OrderSummaryRow {
  totalOrders: string;
  totalCompletedOrders: string;
  totalRevenue: string | null;
}

interface DailyRevenueRow {
  date: string;
  revenue: string;
  orderCount: string;
}

interface DashboardOrderSummaryRow {
  totalRevenue: string | null;
  totalOrders: string;
  completedOrders: string;
  processingOrders: string;
  pendingOrders: string;
  confirmedOrders: string;
  shippingOrders: string;
  cancelledOrders: string;
}

interface TopShopRow {
  shopId: string;
  shopName: string;
  revenue: string;
  completedOrders: string;
}

interface TopProductRow {
  productId: string;
  productName: string;
  imageUrl: string | null;
  shopId: string;
  shopName: string;
  quantitySold: string;
  revenue: string;
}

@Injectable()
export class AdminStatisticsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Seller)
    private readonly sellerRepository: Repository<Seller>,
    @InjectRepository(Shop)
    private readonly shopRepository: Repository<Shop>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
  ) {}

  async getStatistics(query: AdminStatisticsRangeQueryDto) {
    const rangeDays =
      query.range === AdminStatisticsRange.THIRTY_DAYS ? 30 : 7;
    const processingStatuses = [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.SHIPPING,
    ];

    const orderSummaryQuery = this.orderRepository
      .createQueryBuilder('order')
      .select('COUNT(order.orderId)', 'totalOrders')
      .addSelect(
        'COUNT(order.orderId) FILTER (WHERE order.status = :completed)',
        'completedOrders',
      )
      .addSelect(
        'COUNT(order.orderId) FILTER (WHERE order.status IN (:...processingStatuses))',
        'processingOrders',
      )
      .addSelect(
        'COUNT(order.orderId) FILTER (WHERE order.status = :pending)',
        'pendingOrders',
      )
      .addSelect(
        'COUNT(order.orderId) FILTER (WHERE order.status = :confirmed)',
        'confirmedOrders',
      )
      .addSelect(
        'COUNT(order.orderId) FILTER (WHERE order.status = :shipping)',
        'shippingOrders',
      )
      .addSelect(
        'COUNT(order.orderId) FILTER (WHERE order.status = :cancelled)',
        'cancelledOrders',
      )
      .addSelect(
        'COALESCE(SUM(order.totalAmount) FILTER (WHERE order.status = :completed), 0.00)',
        'totalRevenue',
      )
      .setParameters({
        completed: OrderStatus.COMPLETED,
        processingStatuses,
        pending: OrderStatus.PENDING,
        confirmed: OrderStatus.CONFIRMED,
        shipping: OrderStatus.SHIPPING,
        cancelled: OrderStatus.CANCELLED,
      });

    const revenueByDayQuery = this.orderRepository
      .createQueryBuilder('order')
      .select('DATE(order.updatedAt)', 'date')
      .addSelect('SUM(order.totalAmount)', 'revenue')
      .addSelect('COUNT(order.orderId)', 'orders')
      .where('order.status = :completed', {
        completed: OrderStatus.COMPLETED,
      })
      .andWhere(
        "order.updatedAt >= CURRENT_DATE - (:rangeDays - 1) * INTERVAL '1 day'",
        { rangeDays },
      )
      .andWhere("order.updatedAt < CURRENT_DATE + INTERVAL '1 day'")
      .groupBy('DATE(order.updatedAt)')
      .orderBy('DATE(order.updatedAt)', 'ASC');

    const topShopsQuery = this.orderRepository
      .createQueryBuilder('order')
      .innerJoin('order.shop', 'shop')
      .select('order.shopId', 'shopId')
      .addSelect('shop.name', 'shopName')
      .addSelect('SUM(order.totalAmount)', 'revenue')
      .addSelect('COUNT(order.orderId)', 'completedOrders')
      .where('order.status = :completed', {
        completed: OrderStatus.COMPLETED,
      })
      .groupBy('order.shopId')
      .addGroupBy('shop.name')
      .orderBy('SUM(order.totalAmount)', 'DESC')
      .addOrderBy('order.shopId', 'ASC')
      .limit(5);

    const topProductsQuery = this.orderItemRepository
      .createQueryBuilder('orderItem')
      .innerJoin('orderItem.order', 'order')
      .innerJoin('orderItem.product', 'product')
      .innerJoin('product.shop', 'shop')
      .select('orderItem.productId', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('product.imageUrl', 'imageUrl')
      .addSelect('product.shopId', 'shopId')
      .addSelect('shop.name', 'shopName')
      .addSelect('SUM(orderItem.quantity)', 'quantitySold')
      .addSelect('SUM(orderItem.subtotal)', 'revenue')
      .where('order.status = :completed', {
        completed: OrderStatus.COMPLETED,
      })
      .groupBy('orderItem.productId')
      .addGroupBy('product.name')
      .addGroupBy('product.imageUrl')
      .addGroupBy('product.shopId')
      .addGroupBy('shop.name')
      .orderBy('SUM(orderItem.quantity)', 'DESC')
      .addOrderBy('SUM(orderItem.subtotal)', 'DESC')
      .limit(5);

    const [
      totalUsers,
      totalSellers,
      totalShops,
      totalProducts,
      orderSummary,
      revenueByDay,
      topShops,
      topProducts,
    ] = await Promise.all([
      this.userRepository.count(),
      this.sellerRepository.count(),
      this.shopRepository.count(),
      this.productRepository.count(),
      orderSummaryQuery.getRawOne<DashboardOrderSummaryRow>(),
      revenueByDayQuery.getRawMany<{
        date: string;
        revenue: string;
        orders: string;
      }>(),
      topShopsQuery.getRawMany<TopShopRow>(),
      topProductsQuery.getRawMany<TopProductRow>(),
    ]);

    return {
      range: query.range,
      overview: {
        totalRevenue: this.formatMoney(orderSummary?.totalRevenue),
        totalOrders: Number(orderSummary?.totalOrders ?? 0),
        completedOrders: Number(orderSummary?.completedOrders ?? 0),
        processingOrders: Number(orderSummary?.processingOrders ?? 0),
        totalUsers,
        totalSellers,
        totalShops,
        totalProducts,
      },
      orderStatusCounts: {
        pending: Number(orderSummary?.pendingOrders ?? 0),
        confirmed: Number(orderSummary?.confirmedOrders ?? 0),
        shipping: Number(orderSummary?.shippingOrders ?? 0),
        completed: Number(orderSummary?.completedOrders ?? 0),
        cancelled: Number(orderSummary?.cancelledOrders ?? 0),
      },
      revenueByDay: revenueByDay.map((point) => ({
        date: point.date,
        revenue: this.formatMoney(point.revenue),
        orders: Number(point.orders),
      })),
      topShops: topShops.map((shop) => ({
        shopId: shop.shopId,
        shopName: shop.shopName,
        revenue: this.formatMoney(shop.revenue),
        completedOrders: Number(shop.completedOrders),
      })),
      topProducts: topProducts.map((product) => ({
        productId: product.productId,
        productName: product.productName,
        imageUrl: product.imageUrl,
        shopId: product.shopId,
        shopName: product.shopName,
        quantitySold: Number(product.quantitySold),
        revenue: this.formatMoney(product.revenue),
      })),
    };
  }

  async getOverview(query: AdminStatisticsQueryDto) {
    this.validatePeriod(query);

    const orderSummaryQuery = this.orderRepository
      .createQueryBuilder('order')
      .select('COUNT(order.orderId)', 'totalOrders')
      .addSelect(
        'COUNT(order.orderId) FILTER (WHERE order.status = :completedStatus)',
        'totalCompletedOrders',
      )
      .addSelect(
        `COALESCE(
          SUM(order.totalAmount) FILTER (
            WHERE order.status = :completedStatus
          ),
          0.00
        )`,
        'totalRevenue',
      )
      .setParameter('completedStatus', OrderStatus.COMPLETED);

    const dailyRevenueQuery = this.orderRepository
      .createQueryBuilder('order')
      .select('DATE(order.updatedAt)', 'date')
      .addSelect('SUM(order.totalAmount)', 'revenue')
      .addSelect('COUNT(order.orderId)', 'orderCount')
      .where('order.status = :completedStatus', {
        completedStatus: OrderStatus.COMPLETED,
      });

    if (query.from) {
      dailyRevenueQuery.andWhere('order.updatedAt >= CAST(:from AS date)', {
        from: query.from,
      });
    }

    if (query.to) {
      dailyRevenueQuery.andWhere(
        "order.updatedAt < CAST(:to AS date) + INTERVAL '1 day'",
        { to: query.to },
      );
    }

    dailyRevenueQuery
      .groupBy('DATE(order.updatedAt)')
      .orderBy('DATE(order.updatedAt)', 'ASC');

    const [
      totalUsers,
      totalCustomers,
      totalSellers,
      totalShops,
      totalProducts,
      orderSummary,
      dailyRevenue,
    ] = await Promise.all([
      this.userRepository.count(),
      this.customerRepository.count(),
      this.sellerRepository.count(),
      this.shopRepository.count(),
      this.productRepository.count(),
      orderSummaryQuery.getRawOne<OrderSummaryRow>(),
      dailyRevenueQuery.getRawMany<DailyRevenueRow>(),
    ]);

    return {
      summary: {
        totalUsers,
        totalCustomers,
        totalSellers,
        totalShops,
        totalProducts,
        totalOrders: Number(orderSummary?.totalOrders ?? 0),
        totalCompletedOrders: Number(orderSummary?.totalCompletedOrders ?? 0),
        totalRevenue: this.formatMoney(orderSummary?.totalRevenue),
      },
      period: {
        from: query.from ?? null,
        to: query.to ?? null,
      },
      dailyRevenue: dailyRevenue.map((row) => ({
        date: row.date,
        revenue: this.formatMoney(row.revenue),
        orderCount: Number(row.orderCount),
      })),
    };
  }

  private validatePeriod(query: AdminStatisticsQueryDto): void {
    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException('from must be earlier than or equal to to');
    }
  }

  private formatMoney(value?: string | null): string {
    const [integerPart, decimalPart = ''] = (value ?? '0').split('.');
    return `${integerPart}.${decimalPart.padEnd(2, '0').slice(0, 2)}`;
  }
}
