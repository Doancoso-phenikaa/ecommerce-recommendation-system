import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../order/entities/order.entity.js';
import { OrderItem } from '../order/entities/order-item.entity.js';
import { OrderStatus } from '../order/enums/order-status.enum.js';
import { Shop } from '../shop/entities/shop.entity.js';
import { RevenueStatisticsQueryDto } from './dto/revenue-statistics-query.dto.js';
import {
  SellerStatisticsQueryDto,
  SellerStatisticsRange,
} from './dto/seller-statistics-query.dto.js';
import { Seller } from './entities/seller.entity.js';

interface AllTimeSummaryRow {
  revenue: string | null;
  orderCount: string;
}

interface DailyRevenueRow {
  date: string;
  revenue: string;
  orderCount: string;
}

interface StatisticsOverviewRow {
  totalRevenue: string | null;
  totalOrders: string;
  completedOrders: string;
  processingOrders: string;
  pendingOrders: string;
  confirmedOrders: string;
  shippingOrders: string;
  cancelledOrders: string;
}

interface TopProductRow {
  productId: string;
  productName: string;
  imageUrl: string | null;
  quantitySold: string;
  revenue: string;
}

@Injectable()
export class SellerStatisticsService {
  constructor(
    @InjectRepository(Seller)
    private readonly sellerRepository: Repository<Seller>,
    @InjectRepository(Shop)
    private readonly shopRepository: Repository<Shop>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
  ) {}

  async getStatistics(userId: string, query: SellerStatisticsQueryDto) {
    const shop = await this.findSellerShopOrFail(userId);
    const rangeDays =
      query.range === SellerStatisticsRange.THIRTY_DAYS ? 30 : 7;
    const processingStatuses = [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.SHIPPING,
    ];

    const overviewQuery = this.orderRepository
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
      .where('order.shopId = :shopId', { shopId: shop.shopId })
      .setParameters({
        completed: OrderStatus.COMPLETED,
        processingStatuses,
        pending: OrderStatus.PENDING,
        confirmed: OrderStatus.CONFIRMED,
        shipping: OrderStatus.SHIPPING,
        cancelled: OrderStatus.CANCELLED,
      });

    const topProductsQuery = this.orderItemRepository
      .createQueryBuilder('orderItem')
      .innerJoin('orderItem.order', 'order')
      .innerJoin('orderItem.product', 'product')
      .select('orderItem.productId', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('product.imageUrl', 'imageUrl')
      .addSelect('SUM(orderItem.quantity)', 'quantitySold')
      .addSelect('SUM(orderItem.subtotal)', 'revenue')
      .where('order.shopId = :shopId', { shopId: shop.shopId })
      .andWhere('order.status = :completed', {
        completed: OrderStatus.COMPLETED,
      })
      .groupBy('orderItem.productId')
      .addGroupBy('product.name')
      .addGroupBy('product.imageUrl')
      .orderBy('SUM(orderItem.quantity)', 'DESC')
      .addOrderBy('SUM(orderItem.subtotal)', 'DESC')
      .limit(5);

    const revenueQuery = this.orderRepository
      .createQueryBuilder('order')
      .select('DATE(order.updatedAt)', 'date')
      .addSelect('SUM(order.totalAmount)', 'revenue')
      .addSelect('COUNT(order.orderId)', 'orders')
      .where('order.shopId = :shopId', { shopId: shop.shopId })
      .andWhere('order.status = :completed', {
        completed: OrderStatus.COMPLETED,
      })
      .andWhere(
        "order.updatedAt >= CURRENT_DATE - (:rangeDays - 1) * INTERVAL '1 day'",
        { rangeDays },
      )
      .andWhere("order.updatedAt < CURRENT_DATE + INTERVAL '1 day'")
      .groupBy('DATE(order.updatedAt)')
      .orderBy('DATE(order.updatedAt)', 'ASC');

    const [overview, topProducts, revenueByDay] = await Promise.all([
      overviewQuery.getRawOne<StatisticsOverviewRow>(),
      topProductsQuery.getRawMany<TopProductRow>(),
      revenueQuery.getRawMany<{
        date: string;
        revenue: string;
        orders: string;
      }>(),
    ]);

    return {
      shopId: shop.shopId,
      range: query.range,
      overview: {
        totalRevenue: this.formatMoney(overview?.totalRevenue),
        totalOrders: Number(overview?.totalOrders ?? 0),
        completedOrders: Number(overview?.completedOrders ?? 0),
        processingOrders: Number(overview?.processingOrders ?? 0),
      },
      orderStatusCounts: {
        pending: Number(overview?.pendingOrders ?? 0),
        confirmed: Number(overview?.confirmedOrders ?? 0),
        shipping: Number(overview?.shippingOrders ?? 0),
        completed: Number(overview?.completedOrders ?? 0),
        cancelled: Number(overview?.cancelledOrders ?? 0),
      },
      topProducts: topProducts.map((product) => ({
        productId: product.productId,
        productName: product.productName,
        imageUrl: product.imageUrl,
        quantitySold: Number(product.quantitySold),
        revenue: this.formatMoney(product.revenue),
      })),
      revenueByDay: revenueByDay.map((point) => ({
        date: point.date,
        revenue: this.formatMoney(point.revenue),
        orders: Number(point.orders),
      })),
    };
  }

  async getRevenueStatistics(userId: string, query: RevenueStatisticsQueryDto) {
    this.validatePeriod(query);
    const shop = await this.findSellerShopOrFail(userId);

    const summaryQuery = this.orderRepository
      .createQueryBuilder('order')
      .select('COALESCE(SUM(order.totalAmount), 0.00)', 'revenue')
      .addSelect('COUNT(order.orderId)', 'orderCount')
      .where('order.shopId = :shopId', { shopId: shop.shopId })
      .andWhere('order.status = :status', {
        status: OrderStatus.COMPLETED,
      });

    const dailyQuery = this.orderRepository
      .createQueryBuilder('order')
      .select('DATE(order.updatedAt)', 'date')
      .addSelect('SUM(order.totalAmount)', 'revenue')
      .addSelect('COUNT(order.orderId)', 'orderCount')
      .where('order.shopId = :shopId', { shopId: shop.shopId })
      .andWhere('order.status = :status', {
        status: OrderStatus.COMPLETED,
      });

    if (query.from) {
      dailyQuery.andWhere('order.updatedAt >= CAST(:from AS date)', {
        from: query.from,
      });
    }

    if (query.to) {
      dailyQuery.andWhere(
        "order.updatedAt < CAST(:to AS date) + INTERVAL '1 day'",
        { to: query.to },
      );
    }

    dailyQuery
      .groupBy('DATE(order.updatedAt)')
      .orderBy('DATE(order.updatedAt)', 'ASC');

    const [summary, dailyRevenue] = await Promise.all([
      summaryQuery.getRawOne<AllTimeSummaryRow>(),
      dailyQuery.getRawMany<DailyRevenueRow>(),
    ]);

    return {
      shopId: shop.shopId,
      summary: {
        allTimeRevenue: this.formatMoney(summary?.revenue),
        allTimeCompletedOrders: Number(summary?.orderCount ?? 0),
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

  private validatePeriod(query: RevenueStatisticsQueryDto): void {
    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException('from must be earlier than or equal to to');
    }
  }

  private async findSellerShopOrFail(userId: string): Promise<Shop> {
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

    return shop;
  }

  private formatMoney(value?: string | null): string {
    const [integerPart, decimalPart = ''] = (value ?? '0').split('.');
    return `${integerPart}.${decimalPart.padEnd(2, '0').slice(0, 2)}`;
  }
}
