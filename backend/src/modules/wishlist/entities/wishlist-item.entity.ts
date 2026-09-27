import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
} from 'typeorm';
import { Product } from '../../product/entities/product.entity.js';
import { Wishlist } from './wishlist.entity.js';

@Entity({ name: 'wishlist_items' })
@Unique('UQ_wishlist_items_wishlist_id_product_id', [
  'wishlistId',
  'productId',
])
export class WishlistItem {
  @PrimaryGeneratedColumn({ name: 'wishlist_item_id', type: 'bigint' })
  wishlistItemId: string;

  @Column({ name: 'wishlist_id', type: 'bigint' })
  wishlistId: string;

  @Column({ name: 'product_id', type: 'bigint' })
  productId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Wishlist, (wishlist) => wishlist.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'wishlist_id', referencedColumnName: 'wishlistId' })
  wishlist: Relation<Wishlist>;

  @ManyToOne(() => Product, (product) => product.wishlistItems, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'product_id', referencedColumnName: 'productId' })
  product: Relation<Product>;
}
