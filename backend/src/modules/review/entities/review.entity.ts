import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Customer } from '../../customer/entities/customer.entity.js';
import { Order } from '../../order/entities/order.entity.js';
import { Product } from '../../product/entities/product.entity.js';
import { ReviewStatus } from '../enums/review-status.enum.js';

@Entity({ name: 'reviews' })
@Unique('UQ_reviews_customer_id_product_id_order_id', [
  'customerId',
  'productId',
  'orderId',
])
@Check('CHK_reviews_rating_range', '"rating" BETWEEN 1 AND 5')
export class Review {
  @PrimaryGeneratedColumn({ name: 'review_id', type: 'bigint' })
  reviewId: string;

  @Column({ name: 'customer_id', type: 'bigint' })
  customerId: string;

  @Column({ name: 'product_id', type: 'bigint' })
  productId: string;

  @Column({ name: 'order_id', type: 'bigint' })
  orderId: string;

  @Column({ name: 'rating', type: 'smallint' })
  rating: number;

  @Column({ name: 'comment', type: 'text', nullable: true })
  comment: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ReviewStatus,
    enumName: 'review_status_enum',
    default: ReviewStatus.ACTIVE,
  })
  status: ReviewStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Customer, (customer) => customer.reviews, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'customer_id', referencedColumnName: 'customerId' })
  customer: Relation<Customer>;

  @ManyToOne(() => Product, (product) => product.reviews, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'product_id', referencedColumnName: 'productId' })
  product: Relation<Product>;

  @ManyToOne(() => Order, (order) => order.reviews, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'order_id', referencedColumnName: 'orderId' })
  order: Relation<Order>;
}
