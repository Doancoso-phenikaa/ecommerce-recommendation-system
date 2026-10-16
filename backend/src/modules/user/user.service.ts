import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity.js';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  findById(userId: string): Promise<User | null> {
    return this.userRepository.findOneBy({ userId });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOneBy({ email });
  }

  checkEmailExists(email: string): Promise<boolean> {
    return this.userRepository.existsBy({ email });
  }

  checkPhoneExists(phone: string): Promise<boolean> {
    return this.userRepository.existsBy({ phone });
  }
}
