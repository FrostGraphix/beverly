import { describe, expect, it } from 'vitest';
import capturedCreditToken from '../../../../../contracts/samples/credit-token-generate.code-reason-result.json';
import capturedAccounts from '../../../../../contracts/samples/api__account__read.json';
import capturedNestedAccounts from '../../../../../contracts/samples/account-read.code-msg-data.json';
import capturedRemoteTasks from '../../../../../contracts/samples/API__RemoteMeterTask__GetTokenTask.json';
import { buildCalinmeterBearerHeader, buildCalinmeterCreditTokenPayload, buildCalinmeterRemoteTokenPayload, buildCalinmeterStandbyConfirmPayload, buildCalinmeterTaskLookupPayload, buildCalinmeterTaskConfirmPayload, findCalinmeterMeter, normalizeCalinmeterStations, parseCalinmeterCreditTokenResponse, parseCalinmeterTaskRow } from '../calinmeter-v1.js';

describe('Calinmeter v1 adapter wire contract', () => {
    it('preserves legacy bearer authentication', () => {
        expect(buildCalinmeterBearerHeader(' captured-token ')).toEqual({
            name: 'Authorization',
            value: 'Bearer captured-token',
        });
        expect(buildCalinmeterBearerHeader('')).toBeNull();
    });

    it('preserves legacy station normalization', () => {
        expect(normalizeCalinmeterStations({
            result: { data: [
                { stationId: 'TUNGA', name: 'Tunga', remark: 'North', status: true },
                { stationId: 'MUSHA', name: 'Musha', status: 'offline' },
                { stationId: 'ADMIN', name: 'Admin' },
            ] },
        }, {
            oemId: '1494dc89-c52d-4757-9354-75bde004dc04',
            oemSlug: 'calinmeter',
            oemName: 'Calinmeter',
        })).toEqual([
            {
                stationId: 'MUSHA',
                name: 'Musha',
                remark: null,
                oemId: '1494dc89-c52d-4757-9354-75bde004dc04',
                oemSlug: 'calinmeter',
                oemName: 'Calinmeter',
                status: 'disabled',
            },
            {
                stationId: 'TUNGA',
                name: 'Tunga',
                remark: 'North',
                oemId: '1494dc89-c52d-4757-9354-75bde004dc04',
                oemSlug: 'calinmeter',
                oemName: 'Calinmeter',
                status: 'active',
            },
        ]);
    });

    it('preserves task lookup and confirmation payloads', () => {
        expect(buildCalinmeterTaskLookupPayload('47300481810')).toEqual({
            lang: 'en',
            meterId: '47300481810',
            pageNumber: 1,
            pageSize: 10,
            orderBy: 'createDate desc',
        });
        expect(buildCalinmeterTaskConfirmPayload({
            result: { data: [{ id: 8361 }, { id: 8361 }, { taskId: 8362 }] },
        })).toEqual([{ id: 8361 }, { id: 8362 }]);
    });

    it('confirms only the matching standby task', () => {
        expect(buildCalinmeterStandbyConfirmPayload({
            result: { data: [
                { id: 8364, meterId: '47300481810', data: '61688642353365376881', status: 0 },
                { id: 8291, meterId: '47300481810', data: '48811717073300952793', status: 0 },
            ] },
        }, '47300481810', '6168 8642 3533 6537 6881')).toEqual([{ id: 8364 }]);
    });

    it('normalizes a captured failed remote task', () => {
        expect(parseCalinmeterTaskRow(capturedRemoteTasks.body.result.data[0], 'fallback')).toEqual({
            taskId: '5609',
            status: 'failed',
            remark: null,
        });
    });

    it('normalizes a captured successful remote task', () => {
        expect(parseCalinmeterTaskRow(capturedRemoteTasks.body.result.data[1], 'fallback')).toEqual({
            taskId: '5552',
            status: 'success',
            remark: null,
        });
    });

    it('normalizes a meter from the captured account response', () => {
        expect(findCalinmeterMeter(capturedAccounts.body, '470005342689')).toEqual({
            meterId: '470005342689',
            customerId: '470005342689',
            customerName: 'HARUNA ADAMU',
            stationId: 'TUNGA',
            tariffId: 'RESIDENTIAL',
            protocolVersion: '2.2',
            communicationWay: '1',
            isThreePhase: null,
            sgc: null,
        });
    });

    it('accepts the captured nested account envelope', () => {
        expect(findCalinmeterMeter(capturedNestedAccounts.body, '470005342689')).toEqual({
            meterId: '470005342689',
            customerId: '470005342689',
            customerName: 'HARUNA ADAMU',
            stationId: 'TUNGA',
            tariffId: 'RESIDENTIAL',
            protocolVersion: null,
            communicationWay: 'LoraWan',
            isThreePhase: null,
            sgc: null,
        });
    });

    it('normalizes the captured credit-token response', () => {
        const result = parseCalinmeterCreditTokenResponse(capturedCreditToken.body, {
            reference: 'PO-1',
            amountMinor: 500000,
            units: 14.2857,
            generatedAtFallback: '2026-04-28T12:30:00.000Z',
        });

        expect(result).toEqual({
            token: '0021 2636 8628 4408 6688',
            tokenRecordId: '1745843400000',
            amountMinor: 500000,
            units: 14.2857,
            generatedAt: '2026-04-28 09:47:55',
            upstreamPayload: capturedCreditToken.body.result,
        });
    });

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
