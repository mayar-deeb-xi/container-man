CREATE TABLE "file_blobs" (
	"key" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"content" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"delivery_id" uuid NOT NULL,
	"pallet_id" uuid,
	"doc_type" "goods_doc_type",
	"uploaded_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_one_purpose" CHECK ("files"."pallet_id" is null or "files"."doc_type" is null)
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_pallet_id_pallets_id_fk" FOREIGN KEY ("pallet_id") REFERENCES "public"."pallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "files_storage_key_idx" ON "files" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "files_delivery_id_idx" ON "files" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "files_pallet_id_idx" ON "files" USING btree ("pallet_id");