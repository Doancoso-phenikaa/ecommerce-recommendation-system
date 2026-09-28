import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { OrderGroup } from '../../order/entities/order-group.entity.js';
import { PaymentMethod } from '../enums/payment-method.enum.js';
import { PaymentStatus } from '../enums/payment-status.enum.js';

@Entity({ name: 'payments' })
@Check('CHK_payments_amount_non_negative', '"amount" >= 0')
export class Payment {
  @PrimaryGeneratedColumn({ name: 'payment_id', type: 'bigint' })
  paymentId: string;

  @Column({ name: 'order_group_id', type: 'bigint' })
  orderGroupId: string;

  @Column({
    name: 'payment_method',
    type: 'enum',
    enum: PaymentMethod,
    enumName: 'payment_method_enum',
  })
  paymentMethod: PaymentMethod;

  @Column({ name: 'amount', type: 'numeric', precision: 14, scale: 2 })
  amount: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'payment_status_enum',
    default: PaymentStatus.PENDING
  })
  status: PaymentStatus;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => OrderGroup, (orderGroup) => orderGroup.payment, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'order_group_id',
    referencedColumnName: 'orderGroupId',
  })
  orderGroup: Relation<OrderGroup>;
}
