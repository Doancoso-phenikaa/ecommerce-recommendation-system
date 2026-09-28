import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Customer } from '../../customer/entities/customer.entity.js';
import { Product } from '../../product/entities/product.entity.js';
import { BehaviorType } from '../enums/behavior-type.enum.js';

@Entity({ name: 'user_behaviors' })
export class UserBehavior {
  @PrimaryGeneratedColumn({ name: 'behavior_id', type: 'bigint' })
  behaviorId: string;

  @Column({ name: 'customer_id', type: 'bigint' })
  customerId: string;

  @Column({ name: 'product_id', type: 'bigint' })
  productId: string;

  @Column({
    name: 'behavior_type',
    type: 'enum',
    enum: BehaviorType,
    enumName: 'behavior_type_enum',
  })
  behaviorType: BehaviorType;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Customer, (customer) => customer.userBehaviors, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'customer_id', referencedColumnName: 'customerId' })
  customer: Relation<Customer>;

  @ManyToOne(() => Product, (product) => product.userBehaviors, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'product_id', referencedColumnName: 'productId' })
  product: Relation<Product>;
}
