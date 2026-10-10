import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import { DataSource, QueryFailedError } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum.js';
import jwtConfig from '../../configs/jwt.config.js';
import { Customer } from '../customer/entities/customer.entity.js';
import { Seller } from '../seller/entities/seller.entity.js';
import { SellerStatus } from '../seller/enums/seller-status.enum.js';
import { User } from '../user/entities/user.entity.js';
import { UserService } from '../user/user.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterCustomerDto } from './dto/register-customer.dto.js';
import { RegisterSellerDto } from './dto/register-seller.dto.js';
import type { AuthenticationTokenPayload } from './interfaces/authentication-token-payload.interface.js';

const PASSWORD_SALT_ROUNDS = 12;
const POSTGRES_UNIQUE_VIOLATION = '23505';
const INVALID_CREDENTIALS_MESSAGE = 'Email or password incorrect';
const INVALID_REFRESH_TOKEN_MESSAGE = 'Invalid or expired refresh token';

interface PostgresDriverError {
  code?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  async login(loginDto: LoginDto) {
    const email = this.normalizeEmail(loginDto.email);
    const user = await this.userService.findByEmailWithPassword(email);

    if (!user) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatches = await compare(loginDto.password, user.password);

    if (!passwordMatches || !user.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken(user),
      this.signRefreshToken(user),
    ]);

    return {
      accessToken,
      refreshToken,
      user: {
        userId: user.userId,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
      },
    };
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto) {
    let payload: AuthenticationTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<AuthenticationTokenPayload>(
        refreshTokenDto.refreshToken,
        { secret: this.jwtConfiguration.refreshSecret },
      );
    } catch {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN_MESSAGE);
    }

    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN_MESSAGE);
    }

    const user = await this.userService.findById(payload.sub);

    if (!user || !user.isActive) {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN_MESSAGE);
    }

    return {
      accessToken: await this.signAccessToken(user),
      refreshToken: refreshTokenDto.refreshToken,
    };
  }

  async registerCustomer(registerCustomerDto: RegisterCustomerDto) {
    const email = this.normalizeEmail(registerCustomerDto.email);
    const phone = this.normalizeOptionalText(registerCustomerDto.phone);

    if (await this.userService.checkEmailExists(email)) {
      throw new ConflictException('Email already exists');
    }

    if (phone && (await this.userService.checkPhoneExists(phone))) {
      throw new ConflictException('Phone already exists');
    }

    const hashedPassword = await hash(
      registerCustomerDto.password,
      PASSWORD_SALT_ROUNDS,
    );

    try {
      return await this.dataSource.transaction(async (manager) => {
        const userRepository = manager.getRepository(User);
        const customerRepository = manager.getRepository(Customer);

        const user = await userRepository.save(
          userRepository.create({
            fullName: registerCustomerDto.fullName.trim(),
            email,
            phone,
            password: hashedPassword,
            role: UserRole.CUSTOMER,
            isActive: true,
          }),
        );

        const customer = await customerRepository.save(
          customerRepository.create({
            userId: user.userId,
            shippingAddress:
              registerCustomerDto.shippingAddress?.trim() || null,
          }),
        );

        return {
          userId: user.userId,
          customerId: customer.customerId,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isActive: user.isActive,
          shippingAddress: customer.shippingAddress,
          createdAt: user.createdAt,
        };
      });
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Email or phone already exists');
      }

      throw error;
    }
  }

  async registerSeller(registerSellerDto: RegisterSellerDto) {
    const email = this.normalizeEmail(registerSellerDto.email);
    const phone = this.normalizeOptionalText(registerSellerDto.phone);

    if (await this.userService.checkEmailExists(email)) {
      throw new ConflictException('Email already exists');
    }

    if (phone && (await this.userService.checkPhoneExists(phone))) {
      throw new ConflictException('Phone already exists');
    }

    const hashedPassword = await hash(
      registerSellerDto.password,
      PASSWORD_SALT_ROUNDS,
    );

    try {
      return await this.dataSource.transaction(async (manager) => {
        const userRepository = manager.getRepository(User);
        const sellerRepository = manager.getRepository(Seller);

        const user = await userRepository.save(
          userRepository.create({
            fullName: registerSellerDto.fullName.trim(),
            email,
            phone,
            password: hashedPassword,
            role: UserRole.SELLER,
            isActive: true,
          }),
        );

        const seller = await sellerRepository.save(
          sellerRepository.create({
            userId: user.userId,
            status: SellerStatus.ACTIVE,
          }),
        );

        return {
          userId: user.userId,
          sellerId: seller.sellerId,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isActive: user.isActive,
          sellerStatus: seller.status,
          createdAt: user.createdAt,
        };
      });
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Email or phone already exists');
      }

      throw error;
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error.driverError as PostgresDriverError;
    return driverError.code === POSTGRES_UNIQUE_VIOLATION;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizeOptionalText(value: string | undefined): string | null {
    return value?.trim() || null;
  }

  private createTokenPayload(user: User): AuthenticationTokenPayload {
    return {
      sub: user.userId,
      email: user.email,
      role: user.role,
    };
  }

  private signAccessToken(user: User): Promise<string> {
    return this.jwtService.signAsync(this.createTokenPayload(user));
  }

  private signRefreshToken(user: User): Promise<string> {
    return this.jwtService.signAsync(this.createTokenPayload(user), {
      secret: this.jwtConfiguration.refreshSecret,
      expiresIn: this.jwtConfiguration.refreshExpiresIn,
    });
  }
}
