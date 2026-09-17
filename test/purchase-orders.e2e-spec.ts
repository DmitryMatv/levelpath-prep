import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

const ACME = '11111111-1111-1111-1111-111111111111';
const GLOBEX = '22222222-2222-2222-2222-222222222222';
const GLOBEX_ORDER = 'bbbbbbbb-0000-0000-0000-000000000001';
const ORDERS_URL = '/purchase-orders';

type Method = 'get' | 'post' | 'patch' | 'delete';

describe('PurchaseOrdersController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  const asTenant = (tenantId: string, method: Method, url: string) => {
    const root = request(app.getHttpServer());
    const test =
      method === 'get'
        ? root.get(url)
        : method === 'post'
          ? root.post(url)
          : method === 'patch'
            ? root.patch(url)
            : root.delete(url);
    return test.set('x-tenant-id', tenantId);
  };

  it('lists only the caller tenant orders', async () => {
    const res = await asTenant(ACME, 'get', ORDERS_URL).expect(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((o: { title: string }) => o.title).sort()).toEqual([
      'Acme laptops',
      'Acme office chairs',
    ]);
  });

  it('shows Globex only its own orders', async () => {
    const res = await asTenant(GLOBEX, 'get', ORDERS_URL).expect(200);
    expect(res.body).toHaveLength(2);
    expect(
      res.body.every((o: { title: string }) => !o.title.startsWith('Acme')),
    ).toBe(true);
  });

  it('rejects a missing tenant header with 401', async () => {
    await request(app.getHttpServer()).get(ORDERS_URL).expect(401);
  });

  it('rejects a malformed tenant header with 400', async () => {
    await asTenant('not-a-uuid', 'get', ORDERS_URL).expect(400);
  });

  it('creates, lists, updates and deletes within one tenant', async () => {
    const created = await asTenant(ACME, 'post', ORDERS_URL)
      .send({ title: 'Test monitors', totalCents: 50000 })
      .expect(201);
    expect(created.body.title).toBe('Test monitors');
    expect(created.body.totalCents).toBe(50000);

    const listed = await asTenant(ACME, 'get', ORDERS_URL).expect(200);
    expect(listed.body).toHaveLength(3);

    const updated = await asTenant(
      ACME,
      'patch',
      `${ORDERS_URL}/${created.body.id}`,
    )
      .send({ totalCents: 60000 })
      .expect(200);
    expect(updated.body.totalCents).toBe(60000);

    await asTenant(ACME, 'delete', `${ORDERS_URL}/${created.body.id}`).expect(
      204,
    );

    const back = await asTenant(ACME, 'get', ORDERS_URL).expect(200);
    expect(back.body).toHaveLength(2);
  });

  it('hides foreign tenant rows behind 404 and leaves them untouched', async () => {
    await asTenant(ACME, 'get', `${ORDERS_URL}/${GLOBEX_ORDER}`).expect(404);
    await asTenant(ACME, 'patch', `${ORDERS_URL}/${GLOBEX_ORDER}`)
      .send({ title: 'hijack' })
      .expect(404);
    await asTenant(ACME, 'delete', `${ORDERS_URL}/${GLOBEX_ORDER}`).expect(404);

    const globex = await asTenant(GLOBEX, 'get', ORDERS_URL).expect(200);
    expect(globex.body).toHaveLength(2);
  });

  it('returns 404 for an unknown id just like for a foreign id', async () => {
    await asTenant(
      ACME,
      'get',
      `${ORDERS_URL}/eeeeeeee-0000-0000-0000-000000000001`,
    ).expect(404);
  });

  afterAll(async () => {
    await app.close();
  });
});
