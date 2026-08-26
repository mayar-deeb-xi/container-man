import { IsIn, IsOptional, IsUUID } from "class-validator";

import { GOODS_DOC_TYPES } from "@repo/goods-in";

/**
 * The text half of the multipart upload — what the file *is*. Exactly one of the two
 * must be set (the service enforces it): a photo belongs to a pallet, a scan is one
 * of the form's accompanying documents. The file part rides alongside as `file`.
 */
export class UploadFileDto {
  @IsUUID("4")
  @IsOptional()
  palletId?: string;

  @IsIn(GOODS_DOC_TYPES)
  @IsOptional()
  docType?: (typeof GOODS_DOC_TYPES)[number];
}
