import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { UpdateShippingConfigDto } from './dto/update-shipping-config.dto.js';
import { ShippingConfig } from './entities/shipping-config.entity.js';

export const GLOBAL_SHIPPING_CONFIG_ID = 1;

@Injectable()
export class ShippingConfigService {
  constructor(
    @InjectRepository(ShippingConfig)
    private readonly shippingConfigRepository: Repository<ShippingConfig>,
    private readonly dataSource: DataSource,
  ) {}

  async getConfig() {
    const config = await this.shippingConfigRepository.findOneBy({
      shippingConfigId: GLOBAL_SHIPPING_CONFIG_ID,
    });

    if (!config) {
      throw new NotFoundException('Shipping configuration not found');
    }

    return this.buildResponse(config);
  }

  async updateConfig(dto: UpdateShippingConfigDto) {
    return this.dataSource.transaction(async (manager) => {
      const config = await this.lockConfig(manager, 'pessimistic_write');
      config.defaultShippingFee = dto.defaultShippingFee;
      const savedConfig = await manager.getRepository(ShippingConfig).save(config);
      return this.buildResponse(savedConfig);
    });
  }

  async lockConfig(
    manager: EntityManager,
    lockMode: 'pessimistic_read' | 'pessimistic_write' = 'pessimistic_read',
  ): Promise<ShippingConfig> {
    const config = await manager
      .getRepository(ShippingConfig)
      .createQueryBuilder('shippingConfig')
      .setLock(lockMode)
      .where('shippingConfig.shippingConfigId = :shippingConfigId', {
        shippingConfigId: GLOBAL_SHIPPING_CONFIG_ID,
      })
      .getOne();

    if (!config) {
      throw new NotFoundException('Shipping configuration not found');
    }

    return config;
  }

  private buildResponse(config: ShippingConfig) {
    return {
      defaultShippingFee: config.defaultShippingFee,
      updatedAt: config.updatedAt,
    };
  }
}
