import type { Response } from "express";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  SerializeOptions,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import type { AppAbility } from "@repo/access";
import type { AccessTokenPayload } from "@repo/auth";
import { MAX_UPLOAD_BYTES } from "@repo/goods-in";

import type { UploadedUpload } from "./delivery-files.service";
import type { BaseResponse } from "../../lib/base.dto";
import { CurrentAbility } from "../../decorators/current-ability.decorator";
import { CurrentUser } from "../../decorators/current-user.decorator";
import { RequireAbility } from "../../decorators/require-ability.decorator";
import { AbilityGuard } from "../../guards/ability.guard";
import { JwtAccessGuard } from "../../guards/jwt-access.guard";
import { BaseResponseDTO } from "../../lib/base.dto";
import { DeliveryFilesService } from "./delivery-files.service";
import { UploadFileDto } from "./dto/upload-file.dto";
import { DeliveryFileEntity } from "./entities/file.entity";

const FileResponse = BaseResponseDTO(DeliveryFileEntity);

/** What survives into a Content-Disposition header: no quotes, no separators, no control bytes. */
function headerSafe(name: string): string {
  return name.replace(/[^\w.\- ()]/g, "_");
}

/**
 * The files of one delivery — uploads in, streams out, nothing public in between.
 *
 * The download deliberately proxies the bytes instead of answering with a bucket or
 * presigned URL: the bucket stays private, and whether *this* caller may see *this*
 * file is decided here on every request, with the same 404-over-403 shape as every
 * other read. The price is that bytes pass through the API; for photos and A4 scans
 * that is the right trade.
 */
@Controller("deliveries")
@UseGuards(JwtAccessGuard, AbilityGuard)
@RequireAbility({ action: "read", subject: "Delivery" })
@SerializeOptions({ type: FileResponse })
export class DeliveryFilesController {
  constructor(private readonly files: DeliveryFilesService) {}

  /**
   * Multipart: the bytes as `file`, plus exactly one of `palletId` / `docType` saying
   * what the file is. Multer keeps it in memory — the deploy target has no disk worth
   * writing to — and its size limit answers 413 before the buffer grows.
   */
  @Post(":id/files")
  @HttpCode(HttpStatus.CREATED)
  @RequireAbility({ action: "update", subject: "Delivery" })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async upload(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UploadFileDto,
    @UploadedFile() file: UploadedUpload | undefined,
    @CurrentUser() user: AccessTokenPayload,
    @CurrentAbility() ability: AppAbility,
  ): Promise<BaseResponse<DeliveryFileEntity>> {
    return this.files.upload(id, dto, file, ability, user.sub);
  }

  /**
   * The bytes, streamed with the record's metadata as headers. `immutable` is honest
   * cache advice: a file never changes under its id — a draft's replacement is a new
   * id, and a signed record changes nothing ever.
   */
  @Get(":id/files/:fileId")
  async download(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("fileId", ParseUUIDPipe) fileId: string,
    @CurrentAbility() ability: AppAbility,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { body, entity } = await this.files.download(id, fileId, ability);

    res.setHeader("Content-Type", entity.mimeType);
    res.setHeader("Content-Length", String(entity.sizeBytes));
    res.setHeader("Content-Disposition", `inline; filename="${headerSafe(entity.downloadName)}"`);
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    // Uploaded content served inline must never be sniffed into something executable.
    res.setHeader("X-Content-Type-Options", "nosniff");

    return new StreamableFile(body);
  }

  @Delete(":id/files/:fileId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireAbility({ action: "update", subject: "Delivery" })
  async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("fileId", ParseUUIDPipe) fileId: string,
    @CurrentAbility() ability: AppAbility,
  ): Promise<void> {
    await this.files.remove(id, fileId, ability);
  }
}
