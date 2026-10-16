import {
    Check,
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from '../../product/entities/product.entity.js';

@Check('"quantity" >= 0')
@Check('"reserved_quantity" >= 0')
@Check('"reserved_quantity" <= "quantity"')
@Entity({ name: 'inventories' })
export class Inventory {
  @PrimaryGeneratedColumn({ name: 'inventory_id', type: 'bigint' })
  inventoryId: string;

  @Column({ name: 'product_id', type: 'bigint' })
  productId: string;

  @Column({ name: 'quantity', type: 'integer', default: 0 })
  quantity: number;

  @Column({ name: 'reserved_quantity', type: 'integer', default: 0 })
  reservedQuantity: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => Product, (product) => product.inventory, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id', referencedColumnName: 'productId' })
  product: Relation<Product>;
}
