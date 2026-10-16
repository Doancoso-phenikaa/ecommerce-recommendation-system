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

@Entity({ name: 'admins' })
export class Admin {
  @PrimaryGeneratedColumn({ name: 'admin_id', type: 'bigint' })
  adminId: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToOne(() => User, (user) => user.admin, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'userId' })
  user: Relation<User>;
}
