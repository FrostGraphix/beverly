import type {
  MeterOemAdapter,
  VendOutcome,
} from '../packages/oem-contracts';

// Public conformance shape. Provider fields stay behind the adapter.
const adapter: MeterOemAdapter = {
  capabilities: () => ({ 'station.read': 'read_only', 'vending.sts_token': 'write_supported' }),
  testConnection: async () => ({ ok: true }),
  listStations: async () => ({ items: [{ externalId: 'TUNGA', name: 'Tunga' }], nextCursor: null }),
  findMeter: async () => ({ externalId: 'M-1', externalStationId: 'TUNGA' }),
  vend: async (): Promise<VendOutcome> => ({ status: 'confirmed_success', providerReference: 'V-1', token: '1234' }),
  getVendStatus: async (): Promise<VendOutcome> => ({ status: 'pending', providerReference: 'V-1' }),
};

void adapter;
