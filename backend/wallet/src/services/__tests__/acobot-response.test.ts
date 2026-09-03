import { describe, expect, it } from 'vitest';
import { formatOfflineContextAnswer, normalizeBeverlyResponse } from '../acobot-response.js';

describe('Beverly AI response formatting', () => {
    it('turns a single data point into a direct answer', () => {
        expect(formatOfflineContextAnswer('[DATA: METER APPROVALS QUEUE]\n- Pending Approvals Count: 0'))
            .toBe('**Pending approvals:** 0');
    });

    it('formats multiple data points as a compact list', () => {
        expect(formatOfflineContextAnswer('[DATA: FUNDING QUEUE]\n- Pending Count: 2\n- Total Amount: ₦5,000'))
            .toBe('**Funding queue**\n- **Pending:** 2\n- **Total amount:** ₦5,000');
    });

    it('removes filler and internal context labels from provider responses', () => {
        expect(normalizeBeverlyResponse("Here's what I found based on your query:\n\n[DATA: METER APPROVALS QUEUE]\n- Pending Approvals Count: 0"))
            .toBe('**Meter approvals queue**\n**Pending approvals:** 0');
    });

    it('returns a stable empty-state answer', () => {
        expect(normalizeBeverlyResponse('   ')).toBe('No matching data found.');
    });
});
