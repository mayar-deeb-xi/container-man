CREATE TYPE "public"."delivery_status" AS ENUM('draft', 'signed');--> statement-breakpoint
CREATE TYPE "public"."goods_doc_type" AS ENUM('pallet_note', 'cmr', 'delivery_note', 'packing_list', 'weight_certificate', 'annex_vii');--> statement-breakpoint
CREATE TYPE "public"."packing_type" AS ENUM('eur', 'eur_bb', 'eur_kar', 'one_way', 'owp_kart', 'gitterbox', 'special');--> statement-breakpoint
CREATE TYPE "public"."waste_classification" AS ENUM('waste', 'reuse');--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_no" integer GENERATED ALWAYS AS IDENTITY (sequence name "deliveries_delivery_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"supplier_id" uuid NOT NULL,
	"delivered_on" date NOT NULL,
	"lot_no" text,
	"documents" "goods_doc_type"[] DEFAULT '{}'::goods_doc_type[] NOT NULL,
	"status" "delivery_status" DEFAULT 'draft' NOT NULL,
	"signed_by_id" uuid,
	"signed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"pallet_no" integer NOT NULL,
	"packing" "packing_type" NOT NULL,
	"material" text NOT NULL,
	"weee_category" smallint,
	"gross_weight_kg" integer NOT NULL,
	"tare_kg" integer NOT NULL,
	"quantity_pcs" integer,
	"classification" "waste_classification",
	"notice" text,
	"worker_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_signed_by_id_users_id_fk" FOREIGN KEY ("signed_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallets" ADD CONSTRAINT "pallets_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallets" ADD CONSTRAINT "pallets_worker_id_users_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_delivery_no_idx" ON "deliveries" USING btree ("delivery_no");--> statement-breakpoint
CREATE INDEX "deliveries_supplier_id_idx" ON "deliveries" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "deliveries_status_idx" ON "deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deliveries_delivered_on_idx" ON "deliveries" USING btree ("delivered_on");--> statement-breakpoint
CREATE UNIQUE INDEX "pallets_delivery_id_pallet_no_idx" ON "pallets" USING btree ("delivery_id","pallet_no");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_code_idx" ON "suppliers" USING btree ("code") WHERE "suppliers"."deleted_at" is null;