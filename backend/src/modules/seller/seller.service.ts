import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, QueryFailedError, Repository } from 'typeorm';
import { User } from '../user/entities/user.entity.js';
import { UserService } from '../user/user.service.js';
import { UpdateSellerProfileDto } from './dto/update-seller-profile.dto.js';
import { Seller } from './entities/seller.entity.js';

const POSTGRES_UNIQUE_VIOLATION = '23505';

interface PostgresDriverError {
  code?: string;
}

@Injectable()
export class SellerService {
  constructor(
    @InjectRepository(Seller)
    private readonly sellerRepository: Repository<Seller>,
    private readonly userService: UserService,
    private readonly dataSource: DataSource,
  ) {}

  async getProfile(userId: string) {
    const [user, seller] = await Promise.all([
      this.userService.findById(userId),
      this.sellerRepository.findOneBy({ userId }),
    ]);

    if (!user || !seller) {
      throw new NotFoundException('Seller profile not found');
    }

    return this.buildProfileResponse(user, seller);
  }

  async updateProfile(
    userId: string,
    updateSellerProfileDto: UpdateSellerProfileDto,
  ) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const userRepository = manager.getRepository(User);
        const sellerRepository = manager.getRepository(Seller);
        const [user, seller] = await Promise.all([
          userRepository.findOneBy({ userId }),
          sellerRepository.findOneBy({ userId }),
        ]);

        if (!user || !seller) {
          throw new NotFoundException('Seller profile not found');
        }

        if (updateSellerProfileDto.fullName !== undefined) {
          user.fullName = updateSellerProfileDto.fullName.trim();
        }

        if (updateSellerProfileDto.phone !== undefined) {
          const phone = updateSellerProfileDto.phone.trim() || null;

          if (phone && phone !== user.phone) {
            const phoneExists = await userRepository.existsBy({
              phone,
              userId: Not(userId),
            });

            if (phoneExists) {
              throw new ConflictException('Phone already exists');
            }
          }

          user.phone = phone;
        }

        if (updateSellerProfileDto.avatarUrl !== undefined) {
          user.avatarUrl = updateSellerProfileDto.avatarUrl.trim() || null;
        }

        const savedUser = await userRepository.save(user);
        return this.buildProfileResponse(savedUser, seller);
      });
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Phone already exists');
      }

      throw error;
    }
  }

  private buildProfileResponse(user: User, seller: Seller) {
    return {
      userId: user.userId,
      sellerId: seller.sellerId,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      sellerStatus: seller.status,
      createdAt: user.createdAt,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error.driverError as PostgresDriverError;
    return driverError.code === POSTGRES_UNIQUE_VIOLATION;
  }
}
