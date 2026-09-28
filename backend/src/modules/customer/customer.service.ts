import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, QueryFailedError, Repository } from 'typeorm';
import { User } from '../user/entities/user.entity.js';
import { UserService } from '../user/user.service.js';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto.js';
import { Customer } from './entities/customer.entity.js';

const POSTGRES_UNIQUE_VIOLATION = '23505';

interface PostgresDriverError {
  code?: string;
}

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly userService: UserService,
    private readonly dataSource: DataSource,
  ) {}

  async getProfile(userId: string) {
    const [user, customer] = await Promise.all([
      this.userService.findById(userId),
      this.customerRepository.findOneBy({ userId }),
    ]);

    if (!user || !customer) {
      throw new NotFoundException('Customer profile not found');
    }

    return this.buildProfileResponse(user, customer);
  }

  async updateProfile(
    userId: string,
    updateCustomerProfileDto: UpdateCustomerProfileDto,
  ) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const userRepository = manager.getRepository(User);
        const customerRepository = manager.getRepository(Customer);

        const [user, customer] = await Promise.all([
          userRepository.findOneBy({ userId }),
          customerRepository.findOneBy({ userId }),
        ]);

        if (!user || !customer) {
          throw new NotFoundException('Customer profile not found');
        }

        if (updateCustomerProfileDto.fullName !== undefined) {
          user.fullName = updateCustomerProfileDto.fullName.trim();
        }

        if (updateCustomerProfileDto.phone !== undefined) {
          const phone = updateCustomerProfileDto.phone.trim() || null;

          if (phone !== user.phone && phone) {
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

        if (updateCustomerProfileDto.shippingAddress !== undefined) {
          customer.shippingAddress =
            updateCustomerProfileDto.shippingAddress.trim() || null;
        }

        await userRepository.save(user);
        await customerRepository.save(customer);

        return this.buildProfileResponse(user, customer);
      });
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Phone already exists');
      }

      throw error;
    }
  }

  private buildProfileResponse(user: User, customer: Customer) {
    return {
      userId: user.userId,
      customerId: customer.customerId,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      shippingAddress: customer.shippingAddress,
      isActive: user.isActive,
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
