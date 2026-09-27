import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { Customer } from '../../customer/entities/customer.entity.js';
import { CartItem } from './cart-item.entity.js';

@Entity({ name: 'carts' })
export class Cart {
  @PrimaryGeneratedColumn({ name: 'cart_id', type: 'bigint' })
  cartId: string;

  @Column({ name: 'customer_id', type: 'bigint' })
  customerId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => Customer, (customer) => customer.cart, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'customer_id', referencedColumnName: 'customerId' })
  customer: Relation<Customer>;

  @OneToMany(() => CartItem, (cartItem) => cartItem.cart)
  items?: Relation<CartItem[]>;
}
