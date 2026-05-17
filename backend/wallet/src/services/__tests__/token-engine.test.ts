import { describe, it, expect } from 'vitest';
import { previewPurchase, resolveTariffPricing, TokenEngineError } from '../token-engine.js';

describe('token engine pricing', () => {
    it('resolves residential tariff with no tax', () => {
        const t = resolveTariffPricing('RESIDENTIAL');
        expect(t.basePricePerKwh).toBe(350);
        expect(t.taxRate).toBe(0);
        expect(t.effectivePricePerKwh).toBe(350);
    });

    it('applies KOLO 7.5% tax', () => {
        const t = resolveTariffPricing('KOLO');
        expect(t.effectivePricePerKwh).toBeCloseTo(483.75, 4);
    });

    it('rejects unknown tariff', () => {
        expect(() => resolveTariffPricing('UNKNOWN')).toThrow(TokenEngineError);
    });

    it('previewPurchase computes units correctly for residential', () => {
        // ₦5,000 = 500000 kobo at ₦350/kWh = 14.2857 kWh
        const p = previewPurchase(500000, 'RESIDENTIAL');
        expect(p.amountMinor).toBe(500000);
        expect(p.units).toBeCloseTo(14.2857, 3);
        expect(p.tariffId).toBe('RESIDENTIAL');
        expect(p.taxAmountMinor).toBe(0);
    });

    it('previewPurchase computes tax embedded in kobo amount for KOLO', () => {
        // KOLO has 7.5% tax: of ₦1000 paid, ~₦69.77 is tax
        const p = previewPurchase(100000, 'KOLO');
        expect(p.taxAmountMinor).toBeGreaterThan(6000);
        expect(p.taxAmountMinor).toBeLessThan(8000);
    });

    it('rejects non-positive amounts', () => {
        expect(() => previewPurchase(0, 'RESIDENTIAL')).toThrow(TokenEngineError);
        expect(() => previewPurchase(-100, 'RESIDENTIAL')).toThrow(TokenEngineError);
    });
});
