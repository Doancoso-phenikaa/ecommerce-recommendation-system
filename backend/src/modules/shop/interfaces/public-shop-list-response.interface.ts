export interface PublicShopListItem {
  shopId: string;
  name: string;
}

export interface PublicShopListResponse {
  data: PublicShopListItem[];
}
