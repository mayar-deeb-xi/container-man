import { Global, Module } from "@nestjs/common";

import { OBJECT_STORAGE, StorageService } from "./storage.service";

/**
 * Global for the same reason as RedisModule: storage is infrastructure any feature
 * module may reach for. Services inject the `OBJECT_STORAGE` token — the interface,
 * not the implementation — which is what keeps the backing swappable.
 */
@Global()
@Module({
  providers: [StorageService, { provide: OBJECT_STORAGE, useExisting: StorageService }],
  exports: [OBJECT_STORAGE, StorageService],
})
export class StorageModule {}
