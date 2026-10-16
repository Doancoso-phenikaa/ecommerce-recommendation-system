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
  UpdateDateColumn,
} from 'typeorm';
import { CartItem } from '../../cart/entities/cart-item.entity.js';
import { Category } from '../../category/entities/category.entity.js';
import { Inventory } from '../../inventory/entities/inventory.entity.js';
import { OrderItem } from '../../order/entities/order-item.entity.js';
import { Review } from '../../review/entities/review.entity.js';
import { Shop } from '../../shop/entities/shop.entity.js';
import { UserBehavior } from '../../user-behavior/entities/user-behavior.entity.js';
import { WishlistItem } from '../../wishlist/entities/wishlist-item.entity.js';
import { ProductStatus } from '../enums/product-status.enum.js';

@Check('"price" > 0')
@Entity({ name: 'products' })
export class Product {
  @PrimaryGeneratedColumn({ name: 'product_id', type: 'bigint' })
  productId: string;

  @Column({ name: 'shop_id', type: 'bigint' })
  shopId: string;

  @Column({ name: 'category_id', type: 'bigint' })
  categoryId: string;

  @Column({ name: 'name', type: 'varchar', length: 180 })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'price', type: 'numeric', precision: 12, scale: 2 })
  price: string;

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ProductStatus,
    enumName: 'product_status_enum',
    default: ProductStatus.PENDING,
  })
  status: ProductStatus;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Shop, (shop) => shop.products, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shop_id', referencedColumnName: 'shopId' })
  shop: Relation<Shop>;

  @ManyToOne(() => Category, (category) => category.products, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'category_id', referencedColumnName: 'categoryId' })
  category: Relation<Category>;

  @OneToOne(() => Inventory, (inventory) => inventory.product)
  inventory?: Relation<Inventory>;

  @OneToMany(() => CartItem, (cartItem) => cartItem.product)
  cartItems?: Relation<CartItem[]>;

  @OneToMany(() => WishlistItem, (wishlistItem) => wishlistItem.product)
  wishlistItems?: Relation<WishlistItem[]>;

  @OneToMany(() => OrderItem, (orderItem) => orderItem.product)
  orderItems?: Relation<OrderItem[]>;

  @OneToMany(() => Review, (review) => review.product)
  reviews?: Relation<Review[]>;

  @OneToMany(() => UserBehavior, (userBehavior) => userBehavior.product)
  userBehaviors?: Relation<UserBehavior[]>;
}
