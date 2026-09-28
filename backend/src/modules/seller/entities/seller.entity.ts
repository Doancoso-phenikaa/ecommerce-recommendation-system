import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../user/entities/user.entity.js';
import { Shop } from '../../shop/entities/shop.entity.js';
import { SellerStatus } from '../enums/seller-status.enum.js';

@Entity({ name: 'sellers' })
export class Seller {
  @PrimaryGeneratedColumn({ name: 'seller_id', type: 'bigint' })
  sellerId: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: SellerStatus,
    enumName: 'seller_status_enum',
    default: SellerStatus.PENDING,
  })
  status: SellerStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToOne(() => User, (user) => user.seller, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'userId' })
  user: Relation<User>;

  @OneToOne(() => Shop, (shop) => shop.seller)
  shop?: Relation<Shop>;
}
