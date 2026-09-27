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
import { Order } from '../../order/entities/order.entity.js';
import { Product } from '../../product/entities/product.entity.js';
import { Seller } from '../../seller/entities/seller.entity.js';
import { ShopStatus } from '../enums/shop-status.enum.js';

@Entity({ name: 'shops' })
export class Shop {
  @PrimaryGeneratedColumn({ name: 'shop_id', type: 'bigint' })
  shopId: string;

  @Column({ name: 'seller_id', type: 'bigint' })
  sellerId: string;

  @Column({ name: 'name', type: 'varchar', length: 150 })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'rating',
    type: 'numeric',
    precision: 2,
    scale: 1,
    default: 0,
  })
  rating: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ShopStatus,
    enumName: 'shop_status_enum',
    default: ShopStatus.PENDING,
  })
  status: ShopStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => Seller, (seller) => seller.shop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'seller_id', referencedColumnName: 'sellerId' })
  seller: Relation<Seller>;

  @OneToMany(() => Product, (product) => product.shop)
  products?: Relation<Product[]>;

  @OneToMany(() => Order, (order) => order.shop)
  orders?: Relation<Order[]>;

}
