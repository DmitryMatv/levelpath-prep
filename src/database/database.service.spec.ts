import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { DatabaseService } from './database.service';

const ACME = '11111111-1111-1111-1111-111111111111';
const UNKNOWN = '99999999-9999-9999-9999-999999999999';

describe('DatabaseService.withTenant', () => {
  let moduleRef: Awaited<ReturnType<typeof Test.createTestingModule>['compile']>;
  let service: DatabaseService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [DatabaseService],
    }).compile();
    service = moduleRef.get(DatabaseService);
  });

  it('runs queries inside the tenant context and returns the result', async () => {
    const result = await service.withTenant(ACME, (client) =>
      client.query<{ title: string }>(
        'SELECT title FROM purchase_orders ORDER BY title',
      ),
    );
    expect(result.rows.map((row) => row.title)).toEqual([
      'Acme laptops',
      'Acme office chairs',
    ]);
  });

  it('returns zero rows for an unknown tenant (fail closed)', async () => {
    const result = await service.withTenant(UNKNOWN, (client) =>
      client.query<{ n: number }>('SELECT count(*)::int AS n FROM purchase_orders'),
    );
    expect(result.rows[0].n).toBe(0);
  });

  it('rejects a non-UUID tenant id before any SQL runs', async () => {
    await expect(
      service.withTenant(
        "11111111-1111-1111-1111-111111111111'; DROP TABLE purchase_orders; --",
        (client) => client.query('SELECT 1'),
      ),
    ).rejects.toThrow(/not a valid UUID/i);
  });

  it('rolls back the whole transaction on a caller error', async () => {
    await expect(
      service.withTenant(ACME, async (client) => {
        await client.query(
          `INSERT INTO purchase_orders (id, tenant_id, title, total_cents)
           VALUES ('cccccccc-0000-0000-0000-000000000001', $1, 'doomed row', 1)`,
          [ACME],
        );
        throw new Error('boom after insert');
      }),
    ).rejects.toThrow('boom after insert');

    const result = await service.withTenant(ACME, (client) =>
      client.query<{ n: number }>('SELECT count(*)::int AS n FROM purchase_orders'),
    );
    expect(result.rows[0].n).toBe(2);
  });

  afterAll(async () => {
    await moduleRef.close();
  });
});
