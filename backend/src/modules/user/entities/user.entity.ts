import {
  Column,
  CreateDateColumn,
  Entity,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../../../common/enums/user-role.enum.js';
import { Admin } from '../../admin/entities/admin.entity.js';
import { Customer } from '../../customer/entities/customer.entity.js';
import { Seller } from '../../seller/entities/seller.entity.js';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn({ name: 'user_id', type: 'bigint' })
  userId: string;

  @Column({ name: 'full_name', type: 'varchar', length: 100 })
  fullName: string;

  @Column({ name: 'email', type: 'varchar', unique: true, length: 150 })
  email: string;

  @Column({
    name: 'password',
    type: 'varchar',
    length: 255,
    select: false,
  })
  password: string;

  @Column({
    name: 'phone',
    type: 'varchar',
    nullable: true,
    length: 20,
    unique: true,
  })
  phone: string | null;

  @Column({
    name: 'role',
    type: 'enum',
    enum: UserRole,
    enumName: 'user_role_enum',
  })
  role: UserRole;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => Customer, (customer) => customer.user)
  customer?: Relation<Customer>;

  @OneToOne(() => Seller, (seller) => seller.user)
  seller?: Relation<Seller>;

  @OneToOne(() => Admin, (admin) => admin.user)
  admin?: Relation<Admin>;
}
