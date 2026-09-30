import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Customer } from '../customer/entities/customer.entity.js';
import { OrderItem } from '../order/entities/order-item.entity.js';
import { Order } from '../order/entities/order.entity.js';
import { OrderStatus } from '../order/enums/order-status.enum.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { UpdateReviewDto } from './dto/update-review.dto.js';
import { Review } from './entities/review.entity.js';
import { ReviewStatus } from './enums/review-status.enum.js';

const POSTGRES_UNIQUE_VIOLATION = '23505';

interface PostgresDriverError {
  code?: string;
}

@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,
  ) {}

  async createReview(userId: string, dto: CreateReviewDto) {
    const customer = await this.findCustomerOrFail(userId);
    const order = await this.orderRepository
      .createQueryBuilder('order')
      .innerJoin('order.orderGroup', 'orderGroup')
      .where('order.orderId = :orderId', { orderId: dto.orderId })
      .andWhere('orderGroup.customerId = :customerId', {
        customerId: customer.customerId,
      })
      .getOne();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.COMPLETED) {
      throw new ConflictException('Only completed orders can be reviewed');
    }

    const orderItemExists = await this.orderItemRepository.existsBy({
      orderId: order.orderId,
      productId: dto.productId,
    });

    if (!orderItemExists) {
      throw new NotFoundException('Product not found in order');
    }

    const reviewExists = await this.reviewRepository.existsBy({
      customerId: customer.customerId,
      productId: dto.productId,
      orderId: order.orderId,
    });

    if (reviewExists) {
      throw new ConflictException(
        'Product has already been reviewed for this order',
      );
    }

    try {
      const review = await this.reviewRepository.save(
        this.reviewRepository.create({
          customerId: customer.customerId,
          productId: dto.productId,
          orderId: order.orderId,
          rating: dto.rating,
          comment: this.normalizeComment(dto.comment),
          status: ReviewStatus.ACTIVE,
        }),
      );

      return this.buildReviewResponse(review);
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'Product has already been reviewed for this order',
        );
      }

      throw error;
    }
  }

  async updateReview(userId: string, reviewId: string, dto: UpdateReviewDto) {
    const customer = await this.findCustomerOrFail(userId);
    const review = await this.reviewRepository.findOneBy({
      reviewId,
      customerId: customer.customerId,
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (dto.rating !== undefined) {
      review.rating = dto.rating;
    }

    if (dto.comment !== undefined) {
      review.comment = this.normalizeComment(dto.comment);
    }

    return this.buildReviewResponse(await this.reviewRepository.save(review));
  }

  async getProductReviews(productId: string) {
    const reviews = await this.reviewRepository
      .createQueryBuilder('review')
      .innerJoinAndSelect('review.customer', 'customer')
      .innerJoinAndSelect('customer.user', 'user')
      .where('review.productId = :productId', { productId })
      .andWhere('review.status = :status', { status: ReviewStatus.ACTIVE })
      .orderBy('review.createdAt', 'DESC')
      .addOrderBy('review.reviewId', 'DESC')
      .getMany();

    const totalReviews = reviews.length;
    const ratingTotal = reviews.reduce(
      (total, review) => total + review.rating,
      0,
    );
    const averageRating =
      totalReviews === 0
        ? 0
        : Math.round((ratingTotal / totalReviews) * 10) / 10;

    return {
      summary: {
        averageRating,
        totalReviews,
      },
      data: reviews.map((review) => ({
        reviewId: review.reviewId,
        rating: review.rating,
        comment: review.comment,
        customerName: review.customer.user.fullName,
        createdAt: review.createdAt,
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

  private normalizeComment(comment?: string): string | null {
    const normalizedComment = comment?.trim();
    return normalizedComment ? normalizedComment : null;
  }

  private buildReviewResponse(review: Review) {
    return {
      reviewId: review.reviewId,
      productId: review.productId,
      orderId: review.orderId,
      rating: review.rating,
      comment: review.comment,
      status: review.status,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error.driverError as PostgresDriverError;
    return driverError.code === POSTGRES_UNIQUE_VIOLATION;
  }
}
