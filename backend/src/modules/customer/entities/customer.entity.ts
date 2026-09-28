import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Cart } from '../../cart/entities/cart.entity.js';
import { OrderGroup } from '../../order/entities/order-group.entity.js';
import { Review } from '../../review/entities/review.entity.js';
import { UserBehavior } from '../../user-behavior/entities/user-behavior.entity.js';
import { User } from '../../user/entities/user.entity.js';
import { Wishlist } from '../../wishlist/entities/wishlist.entity.js';

@Entity({ name: 'customers' })
export class Customer {
  @PrimaryGeneratedColumn({ name: 'customer_id', type: 'bigint' })
  customerId: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: string;

  @Column({ name: 'shipping_address', type: 'text', nullable: true })
  shippingAddress: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToOne(() => User, (user) => user.customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'userId' })
  user: Relation<User>;

  @OneToOne(() => Cart, (cart) => cart.customer)
  cart?: Relation<Cart>;

  @OneToOne(() => Wishlist, (wishlist) => wishlist.customer)
  wishlist?: Relation<Wishlist>;

  @OneToMany(() => OrderGroup, (orderGroup) => orderGroup.customer)
  orderGroups?: Relation<OrderGroup[]>;

  @OneToMany(() => Review, (review) => review.customer)
  reviews?: Relation<Review[]>;

  @OneToMany(() => UserBehavior, (userBehavior) => userBehavior.customer)
  userBehaviors?: Relation<UserBehavior[]>;
}
