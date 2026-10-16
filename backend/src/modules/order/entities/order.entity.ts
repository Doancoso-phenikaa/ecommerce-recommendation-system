import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { Discount } from '../../discount/entities/discount.entity.js';
import { Review } from '../../review/entities/review.entity.js';
import { Shop } from '../../shop/entities/shop.entity.js';
import { OrderStatus } from '../enums/order-status.enum.js';
import { OrderGroup } from './order-group.entity.js';
import { OrderItem } from './order-item.entity.js';

@Check('CHK_orders_subtotal_non_negative', '"subtotal" >= 0')
@Check('CHK_orders_discount_amount_non_negative', '"discount_amount" >= 0')
@Check('CHK_orders_shipping_fee_non_negative', '"shipping_fee" >= 0')
@Check('CHK_orders_total_amount_non_negative', '"total_amount" >= 0')
@Entity({ name: 'orders' })
export class Order {
  @PrimaryGeneratedColumn({ name: 'order_id', type: 'bigint' })
  orderId: string;

  @Column({ name: 'order_group_id', type: 'bigint' })
  orderGroupId: string;

  @Column({ name: 'shop_id', type: 'bigint' })
  shopId: string;

  @Column({ name: 'discount_id', type: 'bigint', nullable: true })
  discountId: string | null;

  @Column({ name: 'subtotal', type: 'numeric', precision: 14, scale: 2 })
  subtotal: string;

  @Column({
    name: 'discount_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  discountAmount: string;

  @Column({
    name: 'shipping_fee',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  shippingFee: string;

  @Column({ name: 'total_amount', type: 'numeric', precision: 14, scale: 2 })
  totalAmount: string;

  @Column({ name: 'shipping_address', type: 'text' })
  shippingAddress: string;

  @Column({
    name: 'shipping_method',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  shippingMethod: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: OrderStatus,
    enumName: 'order_status_enum',
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => OrderGroup, (orderGroup) => orderGroup.orders, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'order_group_id',
    referencedColumnName: 'orderGroupId',
  })
  orderGroup: Relation<OrderGroup>;

  @ManyToOne(() => Shop, (shop) => shop.orders, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shop_id', referencedColumnName: 'shopId' })
  shop: Relation<Shop>;

  @ManyToOne(() => Discount, (discount) => discount.orders, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'discount_id', referencedColumnName: 'discountId' })
  discount: Relation<Discount> | null;

  @OneToMany(() => OrderItem, (orderItem) => orderItem.order)
  items?: Relation<OrderItem[]>;

  @OneToMany(() => Review, (review) => review.order)
  reviews?: Relation<Review[]>;
}
