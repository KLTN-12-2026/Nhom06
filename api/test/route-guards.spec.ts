import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PERMISSIONS_KEY } from '../src/common/decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../src/common/decorators/public.decorator';

const ALLOWED_PUBLIC_ROUTES = new Set(['GET /health', 'POST /auth/login']);

const ALLOWED_AUTHENTICATED_ONLY_ROUTES = new Set(['GET /auth/me', 'POST /auth/logout']);

function joinRoutePath(controllerPath: string, methodPath: string): string {
  const parts = [controllerPath, methodPath]
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean);
  return `/${parts.join('/')}`;
}

describe('Kiểm tra bảo vệ phân quyền toàn bộ route (AC7)', () => {
  it('mọi route không phải @Public() đều phải có @Permissions(...) hoặc nằm trong danh sách ngoại lệ chỉ cần đăng nhập', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    try {
      const modulesContainer = moduleRef.get(ModulesContainer);
      const metadataScanner = new MetadataScanner();
      const reflector = moduleRef.get(Reflector);

      const discoveredRoutes: string[] = [];
      const violations: string[] = [];

      for (const moduleInstance of modulesContainer.values()) {
        for (const controllerWrapper of moduleInstance.controllers.values()) {
          const { metatype, instance } = controllerWrapper;
          if (!metatype || !instance) {
            continue;
          }

          const rawControllerPath = Reflect.getMetadata(PATH_METADATA, metatype) as
            | string
            | string[]
            | undefined;
          const controllerPath = Array.isArray(rawControllerPath)
            ? rawControllerPath[0]
            : (rawControllerPath ?? '');

          const prototype = Object.getPrototypeOf(instance) as object;
          const methodNames = metadataScanner.getAllMethodNames(prototype);

          for (const methodName of methodNames) {
            const handler = (instance as Record<string, unknown>)[methodName];
            if (typeof handler !== 'function') {
              continue;
            }

            const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as
              | RequestMethod
              | undefined;
            if (requestMethod === undefined) {
              continue;
            }

            const rawMethodPath = Reflect.getMetadata(PATH_METADATA, handler) as
              | string
              | string[]
              | undefined;
            const methodPath = Array.isArray(rawMethodPath)
              ? rawMethodPath[0]
              : (rawMethodPath ?? '');

            const httpMethod = RequestMethod[requestMethod];
            const routeKey = `${httpMethod} ${joinRoutePath(controllerPath, methodPath)}`;
            discoveredRoutes.push(routeKey);

            const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
              handler,
              metatype,
            ]);
            const permissions = reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
              handler,
              metatype,
            ]);

            if (isPublic) {
              if (!ALLOWED_PUBLIC_ROUTES.has(routeKey)) {
                violations.push(`Route @Public() ngoài danh sách cho phép: ${routeKey}`);
              }
              continue;
            }

            if (permissions && permissions.length > 0) {
              continue;
            }

            if (ALLOWED_AUTHENTICATED_ONLY_ROUTES.has(routeKey)) {
              continue;
            }

            violations.push(`Thiếu @Permissions(...) trên route được bảo vệ: ${routeKey}`);
          }
        }
      }

      expect(discoveredRoutes.length).toBeGreaterThanOrEqual(11);
      expect(violations).toEqual([]);
    } finally {
      await moduleRef.close();
    }
  });
});
