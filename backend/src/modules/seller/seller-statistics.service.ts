import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../order/entities/order.entity.js';
import { OrderStatus } from '../order/enums/order-status.enum.js';
import { Shop } from '../shop/entities/shop.entity.js';
import { RevenueStatisticsQueryDto } from './dto/revenue-statistics-query.dto.js';
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

@Injectable()
export class SellerStatisticsService {
  constructor(
    @InjectRepository(Seller)
    private readonly sellerRepository: Repository<Seller>,
    @InjectRepository(Shop)
    private readonly shopRepository: Repository<Shop>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

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
