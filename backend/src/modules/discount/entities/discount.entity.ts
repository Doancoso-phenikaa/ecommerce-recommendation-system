import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from '../../order/entities/order.entity.js';
import { DiscountStatus } from '../enums/discount-status.enum.js';
import { DiscountType } from '../enums/discount-type.enum.js';

@Entity({ name: 'discounts' })
@Check('CHK_discounts_value_positive', '"value" > 0')
@Check('CHK_discounts_date_range', '"end_date" > "start_date"')
@Check('CHK_discounts_used_count_non_negative', '"used_count" >= 0')
@Check(
  'CHK_discounts_min_order_amount_non_negative',
  '"min_order_amount" >= 0',
)
@Check(
  'CHK_discounts_percent_value',
  `"type" <> 'PERCENT' OR "value" <= 100`,
)
@Check(
  'CHK_discounts_usage_limit_positive',
  '"usage_limit" IS NULL OR "usage_limit" > 0',
)
@Check(
  'CHK_discounts_used_count_limit',
  '"usage_limit" IS NULL OR "used_count" <= "usage_limit"',
)
export class Discount {
  @PrimaryGeneratedColumn({ name: 'discount_id', type: 'bigint' })
  discountId: string;

  @Column({ name: 'code', type: 'varchar', length: 50, unique: true})
  code: string;

  @Column({
    name: 'type',
    type: 'enum',
    enum: DiscountType,
    enumName: 'discount_type_enum',
  })
  type: DiscountType;

  @Column({ name: 'value', type: 'numeric', precision: 12, scale: 2 })
  value: string;

  @Column({
    name: 'min_order_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  minOrderAmount: string;

  @Column({ name: 'start_date', type: 'timestamptz' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'timestamptz' })
  endDate: Date;

  @Column({ name: 'usage_limit', type: 'integer', nullable: true })
  usageLimit: number | null;

  @Column({ name: 'used_count', type: 'integer', default: 0 })
  usedCount: number;

  @Column({
    name: 'status',
    type: 'enum',
    enum: DiscountStatus,
    enumName: 'discount_status_enum',
    default: DiscountStatus.ACTIVE,
  })
  status: DiscountStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => Order, (order) => order.discount)
  orders?: Relation<Order[]>;
}
