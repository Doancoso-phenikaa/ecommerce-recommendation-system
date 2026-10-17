import type {
  SellerStatisticsRange,
  SellerStatisticsResponse,
} from '../types/statistics';
import { api } from './axios';

export async function getSellerStatistics(
  range: SellerStatisticsRange = '7d',
): Promise<SellerStatisticsResponse> {
  const response = await api.get<SellerStatisticsResponse>('/seller/statistics', {
    params: { range },
  });

  return response.data;
}
