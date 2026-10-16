import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Product } from '../../product/entities/product.entity.js';
import { Order } from './order.entity.js';

@Entity({ name: 'order_items' })
@Check('CHK_order_items_quantity_positive', '"quantity" > 0')
@Check('CHK_order_items_unit_price_non_negative', '"unit_price" >= 0')
@Check('CHK_order_items_subtotal_non_negative', '"subtotal" >= 0')
export class OrderItem {
  @PrimaryGeneratedColumn({ name: 'order_item_id', type: 'bigint' })
  orderItemId: string;

  @Column({ name: 'order_id', type: 'bigint' })
  orderId: string;

  @Column({ name: 'product_id', type: 'bigint' })
  productId: string;

  @Column({ name: 'product_name', type: 'varchar', length: 180 })
  productName: string;

  @Column({ name: 'quantity', type: 'integer' })
  quantity: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 12, scale: 2 })
  unitPrice: string;

  @Column({ name: 'subtotal', type: 'numeric', precision: 14, scale: 2 })
  subtotal: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id', referencedColumnName: 'orderId' })
  order: Relation<Order>;

  @ManyToOne(() => Product, (product) => product.orderItems, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'product_id', referencedColumnName: 'productId' })
  product: Relation<Product>;
}
