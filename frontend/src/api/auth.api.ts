import { api } from './axios';
import type {
  LoginRequest,
  LoginResponse,
  RegisterCustomerRequest,
  RegisterCustomerResponse,
  RegisterSellerRequest,
  RegisterSellerResponse,
} from '../types/auth';

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>('/auth/login', data);
  return response.data;
}

export async function registerCustomer(
  data: RegisterCustomerRequest,
): Promise<RegisterCustomerResponse> {
  const response = await api.post<RegisterCustomerResponse>(
    '/auth/register/customer',
    data,
  );
  return response.data;
}

export async function registerSeller(
  data: RegisterSellerRequest,
): Promise<RegisterSellerResponse> {
  const response = await api.post<RegisterSellerResponse>(
    '/auth/register/seller',
    data,
  );
  return response.data;
}
