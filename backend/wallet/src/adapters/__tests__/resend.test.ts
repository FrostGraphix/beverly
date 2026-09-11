import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    batchSend: vi.fn(),
    emailSend: vi.fn(),
    env: {
        RESEND_API_KEY: 're_test_key_with_enough_length',
        RESEND_FROM: 'Beverly <noreply@acoblighting.com>',
        EMAIL_ASSET_BASE_URL: 'https://beverly.acoblighting.com/',
    },
}));

vi.mock('resend', () => ({
    Resend: vi.fn(() => ({
        batch: { send: mocks.batchSend },
        emails: { send: mocks.emailSend },
    })),
}));

vi.mock('../../config/env.js', () => ({ env: mocks.env }));

import { EmailBatchError, sendBatch, sendEmail } from '../resend.js';

const message = {
    to: 'customer@example.com',
    subject: 'Beverly update',
    html: '<img src="cid:beverly-logo" alt="Beverly"><p>News</p>',
    text: 'News',
    tag: 'admin-announcement',
};

describe('Resend delivery adapter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.env.EMAIL_ASSET_BASE_URL = 'https://beverly.acoblighting.com/';
        mocks.batchSend.mockResolvedValue({ data: { data: [{ id: 'batch-message-1' }] }, error: null });
        mocks.emailSend.mockResolvedValue({ data: { id: 'single-message-1' }, error: null });
    });

    it('uses hosted branding without unsupported batch attachments', async () => {
        await expect(sendBatch([message], 'announcement-request-1')).resolves.toEqual([
            { messageId: 'batch-message-1' },
        ]);

        expect(mocks.batchSend).toHaveBeenCalledWith([
            expect.objectContaining({
                html: '<img src="https://beverly.acoblighting.com/assets/beverly-logo.png" alt="Beverly"><p>News</p>',
                attachments: undefined,
            }),
        ], { idempotencyKey: 'announcement-request-1:0' });
    });

    it('keeps inline branding for single onboarding sends', async () => {
        await expect(sendEmail(message)).resolves.toEqual({ messageId: 'single-message-1' });

        expect(mocks.emailSend).toHaveBeenCalledWith(expect.objectContaining({
            html: message.html,
            attachments: [expect.objectContaining({ inlineContentId: 'beverly-logo' })],
        }));
    });

    it('reports every accepted message before a later chunk fails', async () => {
        mocks.batchSend
            .mockResolvedValueOnce({
                data: { data: Array.from({ length: 100 }, (_, index) => ({ id: `message-${index}` })) },
                error: null,
            })
            .mockResolvedValueOnce({ data: null, error: { message: 'provider unavailable' } });
        const messages = Array.from({ length: 101 }, (_, index) => ({
            ...message,
            to: `customer-${index}@example.com`,
        }));

        const error = await sendBatch(messages, 'announcement-request-2').catch((caught) => caught);

        expect(error).toBeInstanceOf(EmailBatchError);
        expect(error).toMatchObject({ sentCount: 100, failedCount: 1 });
        expect(error.acceptedMessages).toHaveLength(100);
        expect(error.acceptedMessages[0]).toEqual({ email: 'customer-0@example.com', messageId: 'message-0' });
    });

    it('fails before sending when hosted branding is unavailable', async () => {
        mocks.env.EMAIL_ASSET_BASE_URL = '';

        await expect(sendBatch([message], 'announcement-request-3')).rejects.toThrow('EMAIL_ASSET_BASE_URL');
        expect(mocks.batchSend).not.toHaveBeenCalled();
    });
});
