import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from '../../product/entities/product.entity.js';
import { Cart } from './cart.entity.js';

@Entity({ name: 'cart_items' })
@Unique('UQ_cart_items_cart_id_product_id', ['cartId', 'productId'])
@Check('CHK_cart_items_quantity_positive', '"quantity" > 0')
export class CartItem {
  @PrimaryGeneratedColumn({ name: 'cart_item_id', type: 'bigint' })
  cartItemId: string;

  @Column({ name: 'cart_id', type: 'bigint' })
  cartId: string;

  @Column({ name: 'product_id', type: 'bigint' })
  productId: string;

  @Column({ name: 'quantity', type: 'integer' })
  quantity: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Cart, (cart) => cart.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cart_id', referencedColumnName: 'cartId' })
  cart: Relation<Cart>;

  @ManyToOne(() => Product, (product) => product.cartItems, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'product_id', referencedColumnName: 'productId' })
  product: Relation<Product>;
}
