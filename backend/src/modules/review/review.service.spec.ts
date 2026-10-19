import { Review } from './entities/review.entity.js';
import { ReviewStatus } from './enums/review-status.enum.js';
import { ReviewService } from './review.service.js';

function createReplyHarness(review: Review | null) {
  const queryBuilder = {
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getOne: vi.fn().mockResolvedValue(review),
  };
  const reviewRepository = {
    createQueryBuilder: vi.fn().mockReturnValue(queryBuilder),
    save: vi.fn(async (value: Review) => value),
  };
  const service = Object.assign(Object.create(ReviewService.prototype), {
    reviewRepository,
  }) as ReviewService;

  return { service, queryBuilder, reviewRepository };
}

function buildReview(overrides: Partial<Review> = {}): Review {
  return {
    reviewId: '10',
    customerId: '20',
    productId: '30',
    orderId: '40',
    rating: 5,
    comment: 'Sản phẩm tốt',
    sellerReply: null,
    sellerRepliedAt: null,
    status: ReviewStatus.ACTIVE,
    createdAt: new Date('2026-10-18T08:00:00.000Z'),
    updatedAt: new Date('2026-10-18T08:00:00.000Z'),
    ...overrides,
  } as Review;
}

describe('ReviewService seller reply', () => {
  it('allows a seller to reply to an active review in their own shop', async () => {
    const review = buildReview();
    const { service, queryBuilder, reviewRepository } = createReplyHarness(review);

    const result = await service.replyToReview('7', review.reviewId, {
      reply: '  Cảm ơn bạn đã ủng hộ!  ',
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'seller.userId = :userId',
      { userId: '7' },
    );
    expect(reviewRepository.save).toHaveBeenCalledOnce();
    expect(result.sellerReply).toBe('Cảm ơn bạn đã ủng hộ!');
    expect(result.sellerRepliedAt).toBeInstanceOf(Date);
  });

  it('updates the existing seller reply', async () => {
    const review = buildReview({
      sellerReply: 'Phản hồi cũ',
      sellerRepliedAt: new Date('2026-10-18T09:00:00.000Z'),
    });
    const { service } = createReplyHarness(review);

    const result = await service.replyToReview('7', review.reviewId, {
      reply: 'Phản hồi mới',
    });

    expect(result.sellerReply).toBe('Phản hồi mới');
    expect(result.sellerRepliedAt?.getTime()).toBeGreaterThan(
      new Date('2026-10-18T09:00:00.000Z').getTime(),
    );
  });

  it('hides reviews that do not belong to the authenticated seller shop', async () => {
    const { service, reviewRepository } = createReplyHarness(null);

    await expect(
      service.replyToReview('7', '999', { reply: 'Không hợp lệ' }),
    ).rejects.toThrow('Review not found');
    expect(reviewRepository.save).not.toHaveBeenCalled();
  });

  it('rejects replies to non-active reviews', async () => {
    const { service, reviewRepository } = createReplyHarness(
      buildReview({ status: ReviewStatus.HIDDEN }),
    );

    await expect(
      service.replyToReview('7', '10', { reply: 'Không hợp lệ' }),
    ).rejects.toThrow('Only active reviews can be replied to');
    expect(reviewRepository.save).not.toHaveBeenCalled();
  });

  it('preserves the seller reply when the customer edits their review', async () => {
    const repliedAt = new Date('2026-10-18T09:00:00.000Z');
    const review = buildReview({
      sellerReply: 'Cảm ơn bạn đã ủng hộ!',
      sellerRepliedAt: repliedAt,
    });
    const service = Object.assign(Object.create(ReviewService.prototype), {
      customerRepository: {
        findOneBy: vi.fn().mockResolvedValue({ customerId: '20' }),
      },
      reviewRepository: {
        findOneBy: vi.fn().mockResolvedValue(review),
        save: vi.fn(async (value: Review) => value),
      },
    }) as ReviewService;

    const result = await service.updateReview('5', review.reviewId, {
      rating: 4,
      comment: 'Nội dung đã cập nhật',
    });

    expect(result.rating).toBe(4);
    expect(result.comment).toBe('Nội dung đã cập nhật');
    expect(result.sellerReply).toBe('Cảm ơn bạn đã ủng hộ!');
    expect(result.sellerRepliedAt).toBe(repliedAt);
  });
});
