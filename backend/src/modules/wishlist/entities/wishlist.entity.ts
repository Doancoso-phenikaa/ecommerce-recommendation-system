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
import { WishlistItem } from './wishlist-item.entity.js';

@Entity({ name: 'wishlists' })
export class Wishlist {
  @PrimaryGeneratedColumn({ name: 'wishlist_id', type: 'bigint' })
  wishlistId: string;

  @Column({ name: 'customer_id', type: 'bigint' })
  customerId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => Customer, (customer) => customer.wishlist, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'customer_id', referencedColumnName: 'customerId' })
  customer: Relation<Customer>;

  @OneToMany(() => WishlistItem, (wishlistItem) => wishlistItem.wishlist)
  items?: Relation<WishlistItem[]>;
}
