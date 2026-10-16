import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Customer } from '../../customer/entities/customer.entity.js';
import { Payment } from '../../payment/entities/payment.entity.js';
import { Order } from './order.entity.js';

@Check('CHK_order_groups_total_amount_non_negative', '"total_amount" >= 0')
@Entity({ name: 'order_groups' })
export class OrderGroup {
  @PrimaryGeneratedColumn({ name: 'order_group_id', type: 'bigint' })
  orderGroupId: string;

  @Column({ name: 'customer_id', type: 'bigint' })
  customerId: string;

  @Column({ name: 'total_amount', type: 'numeric', precision: 14, scale: 2 })
  totalAmount: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Customer, (customer) => customer.orderGroups, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'customer_id', referencedColumnName: 'customerId' })
  customer: Relation<Customer>;

  @OneToMany(() => Order, (order) => order.orderGroup)
  orders?: Relation<Order[]>;

  @OneToOne(() => Payment, (payment) => payment.orderGroup)
  payment?: Relation<Payment>;
}
