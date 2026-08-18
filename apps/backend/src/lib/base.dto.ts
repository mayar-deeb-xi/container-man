import type { Type as ClassConstructor } from "@nestjs/common";
import { Exclude, Expose, Type } from "class-transformer";

/**
 * The envelope shape every endpoint returns.
 *
 * The point of wrapping instead of returning the payload bare is that a list
 * endpoint can grow pagination without changing the type of `data`, so clients
 * never have to tell "an array" apart from "an array plus metadata".
 */
export interface Pagination {
  skip: number;
  take: number;
  total: number;
}

export interface BaseResponse<T> {
  data: T;
  pagination?: Pagination;
}

export function baseResponse<T>(data: T): BaseResponse<T> {
  return { data };
}

export function paginated<T>(data: T[], pagination: Pagination): BaseResponse<T[]> {
  return { data, pagination };
}

/**
 * Builds the runtime class that `@SerializeOptions({ type })` needs.
 *
 * `BaseResponse<T>` is erased at compile time, so `ClassSerializerInterceptor`
 * has nothing to reflect on — it needs a real constructor to run
 * `plainToInstance` against. This mints one per payload type.
 *
 * The decorators are applied by hand rather than with `@`-syntax because the
 * class is generated inside a function, where the target type isn't known until
 * the call. Between them they make the envelope an allowlist: class-level
 * `Exclude` drops every key, the two `Expose` calls let `data` and `pagination`
 * back in, and `Type` recurses into the payload class so *its* decorators decide
 * which columns survive.
 *
 * Hoist the result to a module-level const — calling this inline in a decorator
 * mints a fresh class per call site for no benefit.
 */
export function BaseResponseDTO<T>(type: ClassConstructor<T>) {
  class ResponseEnvelope {
    data: T | T[];
    pagination?: Pagination;
  }

  Exclude()(ResponseEnvelope);
  Expose()(ResponseEnvelope.prototype, "data");
  Expose()(ResponseEnvelope.prototype, "pagination");
  Type(() => type)(ResponseEnvelope.prototype, "data");

  return ResponseEnvelope;
}
