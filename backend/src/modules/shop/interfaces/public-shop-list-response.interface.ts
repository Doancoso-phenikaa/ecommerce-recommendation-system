export interface PublicShopListItem {
  shopId: string;
  name: string;
  logoUrl: string | null;
}

export interface PublicShopListResponse {
  data: PublicShopListItem[];
}
