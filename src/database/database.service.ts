import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';
import { isUuid } from '../common/is-uuid';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    this.pool = new Pool({
      host: config.getOrThrow<string>('POSTGRES_HOST'),
      port: Number(config.getOrThrow<string>('POSTGRES_PORT')),
      user: config.getOrThrow<string>('TENANT_APP_USER'),
      password: config.getOrThrow<string>('TENANT_APP_PASSWORD'),
      database: config.getOrThrow<string>('POSTGRES_DB'),
      max: 10,
    });
  }

  async withTenant<T>(
    tenantId: string,
    run: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (!isUuid(tenantId)) {
      throw new Error(`withTenant: tenantId is not a valid UUID: ${tenantId}`);
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', [
        'app.tenant_id',
        tenantId,
      ]);
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
