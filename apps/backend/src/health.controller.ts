import { Controller, Get, SerializeOptions } from "@nestjs/common";
import { Exclude, Expose } from "class-transformer";

import type { BaseResponse } from "./lib/base.dto";
import { BaseResponseDTO } from "./lib/base.dto";

@Exclude()
class HealthEntity {
  @Expose() status: string;
}

const HealthResponse = BaseResponseDTO(HealthEntity);

@Controller("health")
export class HealthController {
  @Get()
  @SerializeOptions({ type: HealthResponse })
  check(): BaseResponse<{ status: string }> {
    return { data: { status: "ok" } };
  }
}
