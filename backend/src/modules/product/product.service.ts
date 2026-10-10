import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Category } from '../category/entities/category.entity.js';
import { CategoryStatus } from '../category/enums/category-status.enum.js';
import { Inventory } from '../inventory/entities/inventory.entity.js';
import { Seller } from '../seller/entities/seller.entity.js';
import { Shop } from '../shop/entities/shop.entity.js';
import { ShopStatus } from '../shop/enums/shop-status.enum.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { ProductQueryDto } from './dto/product-query.dto.js';
import { UpdateInventoryDto } from './dto/update-inventory.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { Product } from './entities/product.entity.js';
import { ProductStatus } from './enums/product-status.enum.js';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Seller)
    private readonly sellerRepository: Repository<Seller>,
    @InjectRepository(Shop)
    private readonly shopRepository: Repository<Shop>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    private readonly dataSource: DataSource,
  ) {}

  async getProducts(productQueryDto: ProductQueryDto) {
    const { search, categoryId, shopId, minPrice, maxPrice, page, limit } =
      productQueryDto;

    if (
      minPrice !== undefined &&
      maxPrice !== undefined &&
      this.decimalToCents(minPrice) > this.decimalToCents(maxPrice)
    ) {
      throw new BadRequestException(
        'minPrice must be less than or equal to maxPrice',
      );
    }

    const queryBuilder = this.productRepository
      .createQueryBuilder('product')
      .innerJoinAndSelect('product.shop', 'shop')
      .innerJoinAndSelect('product.inventory', 'inventory')
      .where('product.status = :productStatus', {
        productStatus: ProductStatus.APPROVED,
      })
      .andWhere('shop.status = :shopStatus', {
        shopStatus: ShopStatus.ACTIVE,
      });

    if (search) {
      queryBuilder.andWhere('product.name ILIKE :search', {
        search: `%${search}%`,
      });
    }

    if (categoryId !== undefined) {
      queryBuilder.andWhere('product.categoryId = :categoryId', {
        categoryId,
      });
    }

    if (shopId !== undefined) {
      queryBuilder.andWhere('product.shopId = :shopId', { shopId });
    }

    if (minPrice !== undefined) {
      queryBuilder.andWhere('product.price >= :minPrice', { minPrice });
    }

    if (maxPrice !== undefined) {
      queryBuilder.andWhere('product.price <= :maxPrice', { maxPrice });
    }

    queryBuilder
      .orderBy('product.createdAt', 'DESC')
      .addOrderBy('product.productId', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [products, totalItems] = await queryBuilder.getManyAndCount();

    return {
      data: products.map((product) => this.buildPublicProductResponse(product)),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  async getProductDetail(productId: string) {
    const product = await this.productRepository
      .createQueryBuilder('product')
      .innerJoinAndSelect('product.shop', 'shop')
      .innerJoinAndSelect('product.inventory', 'inventory')
      .where('product.productId = :productId', { productId })
      .andWhere('product.status = :productStatus', {
        productStatus: ProductStatus.APPROVED,
      })
      .andWhere('shop.status = :shopStatus', {
        shopStatus: ShopStatus.ACTIVE,
      })
      .getOne();

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.buildPublicProductResponse(product);
  }

  async createProduct(userId: string, createProductDto: CreateProductDto) {
    const shop = await this.findActiveSellerShop(userId);
    const category = await this.findActiveCategory(createProductDto.categoryId);

    return this.dataSource.transaction(async (manager) => {
      const productRepository = manager.getRepository(Product);
      const inventoryRepository = manager.getRepository(Inventory);

      const product = await productRepository.save(
        productRepository.create({
          shopId: shop.shopId,
          categoryId: category.categoryId,
          name: createProductDto.name.trim(),
          description: createProductDto.description?.trim() || null,
          price: createProductDto.price,
          imageUrl: createProductDto.imageUrl?.trim() || null,
          status: ProductStatus.PENDING,
          rejectionReason: null,
          approvedAt: null,
        }),
      );

      const inventory = await inventoryRepository.save(
        inventoryRepository.create({
          productId: product.productId,
          quantity: createProductDto.quantity,
          reservedQuantity: 0,
        }),
      );

      return this.buildProductResponse(product, inventory);
    });
  }

  async updateProduct(
    userId: string,
    productId: string,
    updateProductDto: UpdateProductDto,
  ) {
    const shop = await this.findActiveSellerShop(userId);
    const product = await this.findOwnedProduct(productId, shop.shopId);
    const inventory = await this.findInventoryOrFail(productId);
    let hasChanges = false;

    if (updateProductDto.categoryId !== undefined) {
      const category = await this.findActiveCategory(
        updateProductDto.categoryId,
      );

      if (product.categoryId !== category.categoryId) {
        product.categoryId = category.categoryId;
        hasChanges = true;
      }
    }

    if (updateProductDto.name !== undefined) {
      const name = updateProductDto.name.trim();

      if (product.name !== name) {
        product.name = name;
        hasChanges = true;
      }
    }

    if (updateProductDto.description !== undefined) {
      const description = updateProductDto.description.trim() || null;

      if (product.description !== description) {
        product.description = description;
        hasChanges = true;
      }
    }

    if (updateProductDto.price !== undefined) {
      const price = updateProductDto.price.trim();

      if (product.price !== price) {
        product.price = price;
        hasChanges = true;
      }
    }

    if (updateProductDto.imageUrl !== undefined) {
      const imageUrl = updateProductDto.imageUrl.trim() || null;

      if (product.imageUrl !== imageUrl) {
        product.imageUrl = imageUrl;
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      return this.buildProductResponse(product, inventory);
    }

    if (product.status === ProductStatus.APPROVED) {
      product.status = ProductStatus.PENDING;
      product.rejectionReason = null;
      product.approvedAt = null;
    }

    const updatedProduct = await this.productRepository.save(product);
    return this.buildProductResponse(updatedProduct, inventory);
  }

  async updateInventory(
    userId: string,
    productId: string,
    updateInventoryDto: UpdateInventoryDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const shop = await this.findActiveSellerShopInTransaction(
        manager,
        userId,
      );
      await this.findOwnedProductInTransaction(
        manager,
        productId,
        shop.shopId,
      );

      const inventoryRepository = manager.getRepository(Inventory);
      const inventory = await inventoryRepository
        .createQueryBuilder('inventory')
        .setLock('pessimistic_write')
        .where('inventory.productId = :productId', { productId })
        .getOne();

      if (!inventory) {
        throw new NotFoundException('Inventory not found');
      }

      if (updateInventoryDto.quantity < inventory.reservedQuantity) {
        throw new ConflictException(
          'Inventory quantity cannot be lower than reserved quantity',
        );
      }

      inventory.quantity = updateInventoryDto.quantity;
      const updatedInventory = await inventoryRepository.save(inventory);

      return {
        productId,
        quantity: updatedInventory.quantity,
        reservedQuantity: updatedInventory.reservedQuantity,
        updatedAt: updatedInventory.updatedAt,
      };
    });
  }

  async approveProduct(productId: string) {
    const product = await this.findProductOrFail(productId);

    if (product.status !== ProductStatus.PENDING) {
      throw new ConflictException('Only pending products can be approved');
    }

    const inventory = await this.findInventoryOrFail(productId);
    product.status = ProductStatus.APPROVED;
    product.rejectionReason = null;
    product.approvedAt = new Date();

    const approvedProduct = await this.productRepository.save(product);
    return this.buildProductResponse(approvedProduct, inventory);
  }

  async rejectProduct(productId: string, rejectionReasonInput: string) {
    const product = await this.findProductOrFail(productId);

    if (product.status !== ProductStatus.PENDING) {
      throw new ConflictException('Only pending products can be rejected');
    }

    const rejectionReason = rejectionReasonInput.trim();

    if (!rejectionReason) {
      throw new BadRequestException('Rejection reason must not be empty');
    }

    const inventory = await this.findInventoryOrFail(productId);
    product.status = ProductStatus.REJECTED;
    product.rejectionReason = rejectionReason;
    product.approvedAt = null;

    const rejectedProduct = await this.productRepository.save(product);
    return this.buildProductResponse(rejectedProduct, inventory);
  }

  async resubmitProduct(userId: string, productId: string) {
    const shop = await this.findActiveSellerShop(userId);
    const product = await this.findOwnedProduct(productId, shop.shopId);

    if (product.status !== ProductStatus.REJECTED) {
      throw new ConflictException('Only rejected products can be resubmitted');
    }

    const inventory = await this.findInventoryOrFail(productId);
    product.status = ProductStatus.PENDING;
    product.rejectionReason = null;
    product.approvedAt = null;

    const resubmittedProduct = await this.productRepository.save(product);
    return this.buildProductResponse(resubmittedProduct, inventory);
  }

  private async findActiveSellerShop(userId: string): Promise<Shop> {
    const seller = await this.sellerRepository.findOneBy({ userId });

    if (!seller) {
      throw new NotFoundException('Seller profile not found');
    }

    const shop = await this.shopRepository.findOneBy({
      sellerId: seller.sellerId,
    });

    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    if (shop.status !== ShopStatus.ACTIVE) {
      throw new ForbiddenException('Shop must be active to manage products');
    }

    return shop;
  }

  private async findActiveSellerShopInTransaction(
    manager: EntityManager,
    userId: string,
  ): Promise<Shop> {
    const seller = await manager.getRepository(Seller).findOneBy({ userId });

    if (!seller) {
      throw new NotFoundException('Seller profile not found');
    }

    const shop = await manager.getRepository(Shop).findOneBy({
      sellerId: seller.sellerId,
    });

    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    if (shop.status !== ShopStatus.ACTIVE) {
      throw new ForbiddenException('Shop must be active to manage products');
    }

    return shop;
  }

  private async findOwnedProductInTransaction(
    manager: EntityManager,
    productId: string,
    shopId: string,
  ): Promise<Product> {
    const product = await manager.getRepository(Product).findOneBy({
      productId,
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.shopId !== shopId) {
      throw new ForbiddenException('Product does not belong to your shop');
    }

    return product;
  }

  private async findOwnedProduct(
    productId: string,
    shopId: string,
  ): Promise<Product> {
    const product = await this.findProductOrFail(productId);

    if (product.shopId !== shopId) {
      throw new ForbiddenException('Product does not belong to your shop');
    }

    return product;
  }

  private async findProductOrFail(productId: string): Promise<Product> {
    const product = await this.productRepository.findOneBy({ productId });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  private async findInventoryOrFail(productId: string): Promise<Inventory> {
    const inventory = await this.inventoryRepository.findOneBy({ productId });

    if (!inventory) {
      throw new NotFoundException('Inventory not found');
    }

    return inventory;
  }

  private async findActiveCategory(categoryId: string): Promise<Category> {
    const category = await this.categoryRepository.findOneBy({ categoryId });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category.status !== CategoryStatus.ACTIVE) {
      throw new ConflictException('Category is not active');
    }

    return category;
  }

  private buildProductResponse(product: Product, inventory: Inventory) {
    return {
      productId: product.productId,
      shopId: product.shopId,
      categoryId: product.categoryId,
      name: product.name,
      description: product.description,
      price: product.price,
      imageUrl: product.imageUrl,
      status: product.status,
      rejectionReason: product.rejectionReason,
      approvedAt: product.approvedAt,
      inventory: {
        quantity: inventory.quantity,
        reservedQuantity: inventory.reservedQuantity,
      },
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  private buildPublicProductResponse(product: Product) {
    const inventory = product.inventory;

    if (!inventory) {
      throw new NotFoundException('Inventory not found');
    }

    return {
      productId: product.productId,
      shopId: product.shopId,
      categoryId: product.categoryId,
      name: product.name,
      description: product.description,
      price: product.price,
      imageUrl: product.imageUrl,
      approvedAt: product.approvedAt,
      inventory: {
        quantity: inventory.quantity,
        reservedQuantity: inventory.reservedQuantity,
        availableQuantity: inventory.quantity - inventory.reservedQuantity,
      },
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  private decimalToCents(value: string): bigint {
    const [wholePart, fractionPart = ''] = value.split('.');
    return BigInt(wholePart) * 100n + BigInt(fractionPart.padEnd(2, '0'));
  }
}
