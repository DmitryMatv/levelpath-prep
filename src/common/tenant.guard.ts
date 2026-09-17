import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { isUuid } from './is-uuid';

type TenantRequest = Request & { tenantId?: string };

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    const tenantId = request.headers['x-tenant-id'];
    if (typeof tenantId !== 'string') {
      throw new UnauthorizedException('Missing x-tenant-id header');
    }
    if (!isUuid(tenantId)) {
      throw new BadRequestException('x-tenant-id must be a UUID');
    }
    request.tenantId = tenantId;
    return true;
  }
}
