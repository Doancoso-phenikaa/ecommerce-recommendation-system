import type {
  AdminStatisticsRange,
  AdminStatisticsResponse,
} from '../types/statistics';
import { api } from './axios';

export async function getAdminStatistics(
  range: AdminStatisticsRange = '7d',
): Promise<AdminStatisticsResponse> {
  const response = await api.get<AdminStatisticsResponse>('/admin/statistics', {
    params: { range },
  });

  return response.data;
}
