import { Check, Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Check('CHK_shipping_configs_singleton', '"shipping_config_id" = 1')
@Check('CHK_shipping_configs_fee_non_negative', '"default_shipping_fee" >= 0')
@Entity({ name: 'shipping_configs' })
export class ShippingConfig {
  @PrimaryColumn({ name: 'shipping_config_id', type: 'integer' })
  shippingConfigId: number;

  @Column({
    name: 'default_shipping_fee',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  defaultShippingFee: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
