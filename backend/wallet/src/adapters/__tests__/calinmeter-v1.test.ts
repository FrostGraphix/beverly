import { describe, expect, it } from 'vitest';
import { buildCalinmeterCreditTokenPayload, buildCalinmeterRemoteTokenPayload } from '../calinmeter-v1.js';

describe('Calinmeter v1 adapter wire contract', () => {
    it('preserves the observed credit-token request', () => {
        const payload = buildCalinmeterCreditTokenPayload({
            customerId: '47005363529',
            customerName: 'LUKA ISAIAH',
            meterId: '47005363529',
            tariffId: 'RESIDENTIAL',
            amountMinor: 500000,
            units: 14.2857,
            isThreePhase: true,
            reference: 'PO-3P',
            authorizationPassword: 'test-only',
        });

        expect(payload).toEqual({
            customerId: '47005363529',
            meterId: '47005363529',
            tariffId: 'RESIDENTIAL',
            authorizationPassword: 'test-only',
            remark: 'Beverly vend PO-3P',
            isPreview: false,
            isVendByTotalPaid: true,
            amount: 5000,
            totalUnit: 14.2857,
            payDebtPercent: 0,
            paymentMethod: 'Cash',
            isS2: true,
            operatorName: 'LUKA ISAIAH',
            userName: 'LUKA ISAIAH',
            vendorName: 'LUKA ISAIAH',
            operator: 'LUKA ISAIAH',
        });
    });

    it('preserves the observed remote token task payload', () => {
        const payload = buildCalinmeterRemoteTokenPayload({
            customerId: '47005363529',
            customerName: 'LUKA ISAIAH',
            meterId: '47005363529',
            stationId: 'KYAKALE',
            protocolVersion: '2.2',
            token: '0021 2636 8628 4408 6688',
            reference: 'PO-1',
        });

        expect(payload).toEqual([{
            customerId: '47005363529',
            customerName: 'LUKA ISAIAH',
            meterId: '47005363529',
            version: '2.2',
            flag: 'A120',
            name: 'Send Token',
            dataItem: 'Send Token',
            dataDefault: '',
            dataPrefix: '',
            data: '00212636862844086688',
            stationId: 'KYAKALE',
            remark: 'Beverly remote token PO-1',
        }]);
    });
});
