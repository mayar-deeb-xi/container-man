import { Global, Module } from "@nestjs/common";

import { AbilityService } from "./ability.service";

/**
 * Global because the guards depend on it, and a guard is resolved against the
 * injector of whichever module declares the controller using it — so a non-global
 * module would have to be imported by every feature module that guards a route,
 * and forgetting one fails at boot rather than at review.
 */
@Global()
@Module({
  providers: [AbilityService],
  exports: [AbilityService],
})
export class AbilityModule {}
