import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isUuid } from '../common/is-uuid';
import { DatabaseService } from '../database/database.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { PurchaseOrder } from './entities/purchase-order.entity';

interface PurchaseOrderRow {
  id: string;
  tenant_id: string;
  title: string;
  total_cents: number;
  created_at: Date;
}

const COLUMNS = 'id, tenant_id, title, total_cents, created_at';

function toEntity(row: PurchaseOrderRow): PurchaseOrder {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    title: row.title,
    totalCents: row.total_cents,
    createdAt: row.created_at,
  };
}

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly db: DatabaseService) {}

  findAll(tenantId: string): Promise<PurchaseOrder[]> {
    return this.db.withTenant(tenantId, (client) =>
      client
        .query<PurchaseOrderRow>(
          `SELECT ${COLUMNS} FROM purchase_orders ORDER BY created_at`,
        )
        .then((result) => result.rows.map(toEntity)),
    );
  }

  async findOne(tenantId: string, id: string): Promise<PurchaseOrder> {
    if (!isUuid(id)) {
      throw new BadRequestException('id must be a UUID');
    }
    return this.db.withTenant(tenantId, async (client) => {
      const result = await client.query<PurchaseOrderRow>(
        `SELECT ${COLUMNS} FROM purchase_orders WHERE id = $1`,
        [id],
      );
      if (result.rows.length === 0) {
        throw new NotFoundException(`Purchase order ${id} not found`);
      }
      return toEntity(result.rows[0]);
    });
  }

  async create(
    tenantId: string,
    dto: CreatePurchaseOrderDto,
  ): Promise<PurchaseOrder> {
    return this.db.withTenant(tenantId, async (client) => {
      const result = await client.query<PurchaseOrderRow>(
        `INSERT INTO purchase_orders (id, tenant_id, title, total_cents)
         VALUES ($1, $2, $3, $4)
         RETURNING ${COLUMNS}`,
        [randomUUID(), tenantId, dto.title, dto.totalCents],
      );
      return toEntity(result.rows[0]);
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdatePurchaseOrderDto,
  ): Promise<PurchaseOrder> {
    if (!isUuid(id)) {
      throw new BadRequestException('id must be a UUID');
    }
    return this.db.withTenant(tenantId, async (client) => {
      const assignments: string[] = [];
      const values: unknown[] = [];
      if (dto.title !== undefined) {
        values.push(dto.title);
        assignments.push(`title = $${values.length}`);
      }
      if (dto.totalCents !== undefined) {
        values.push(dto.totalCents);
        assignments.push(`total_cents = $${values.length}`);
      }
      if (assignments.length === 0) {
        throw new BadRequestException('Nothing to update');
      }
      values.push(id);
      const result = await client.query<PurchaseOrderRow>(
        `UPDATE purchase_orders SET ${assignments.join(', ')}
         WHERE id = $${values.length}
         RETURNING ${COLUMNS}`,
        values,
      );
      if (result.rows.length === 0) {
        throw new NotFoundException(`Purchase order ${id} not found`);
      }
      return toEntity(result.rows[0]);
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    if (!isUuid(id)) {
      throw new BadRequestException('id must be a UUID');
    }
    await this.db.withTenant(tenantId, async (client) => {
      const result = await client.query(
        'DELETE FROM purchase_orders WHERE id = $1',
        [id],
      );
      if ((result.rowCount ?? 0) === 0) {
        throw new NotFoundException(`Purchase order ${id} not found`);
      }
    });
  }
}
