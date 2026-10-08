import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../customer/entities/customer.entity.js';
import { Order } from '../order/entities/order.entity.js';
import { OrderStatus } from '../order/enums/order-status.enum.js';
import { Product } from '../product/entities/product.entity.js';
import { Seller } from '../seller/entities/seller.entity.js';
import { Shop } from '../shop/entities/shop.entity.js';
import { User } from '../user/entities/user.entity.js';
import { AdminStatisticsQueryDto } from './dto/admin-statistics-query.dto.js';

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
  ) {}

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
