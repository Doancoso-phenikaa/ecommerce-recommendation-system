import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterCustomerDto } from './dto/register-customer.dto.js';
import { RegisterSellerDto } from './dto/register-seller.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getCurrentUser(@CurrentUser() currentUser: AuthenticatedUser) {
    return currentUser;
  }

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto);
  }

  @Post('register/customer')
  registerCustomer(@Body() registerCustomerDto: RegisterCustomerDto) {
    return this.authService.registerCustomer(registerCustomerDto);
  }

  @Post('register/seller')
  registerSeller(@Body() registerSellerDto: RegisterSellerDto) {
    return this.authService.registerSeller(registerSellerDto);
  }
}
