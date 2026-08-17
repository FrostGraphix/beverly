import { describe, expect, it } from 'vitest';
import { assertStationVendAllowed, StationVendScopeError } from '../station-vend-scope.js';

describe('station vending boundary', () => {
    it('allows matching stations case-insensitively', () => {
        expect(() => assertStationVendAllowed('tunga', 'TUNGA')).not.toThrow();
    });

    it('rejects cross-station vending', () => {
        expect(() => assertStationVendAllowed('TUNGA', 'UMAISHA')).toThrowError(
            expect.objectContaining<Partial<StationVendScopeError>>({ code: 'cross_station_vend_forbidden' }),
        );
    });

    it('rejects missing station assignments', () => {
        expect(() => assertStationVendAllowed(null, 'TUNGA')).toThrowError(
            expect.objectContaining<Partial<StationVendScopeError>>({ code: 'station_assignment_required' }),
        );
    });
});
