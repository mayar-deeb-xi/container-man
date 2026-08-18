CREATE TYPE "public"."container_condition" AS ENUM('new', 'cargo_worthy', 'wind_water_tight', 'damaged');--> statement-breakpoint
CREATE TYPE "public"."container_status" AS ENUM('available', 'allocated', 'loaded', 'in_transit', 'at_port', 'under_repair', 'damaged', 'retired');--> statement-breakpoint
CREATE TYPE "public"."container_type" AS ENUM('dry', 'high_cube', 'reefer', 'open_top', 'flat_rack', 'tank', 'ventilated', 'platform');--> statement-breakpoint
CREATE TABLE "containers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"container_number" text NOT NULL,
	"iso_type_code" text,
	"type" "container_type" NOT NULL,
	"size_ft" smallint NOT NULL,
	"status" "container_status" DEFAULT 'available' NOT NULL,
	"condition" "container_condition" DEFAULT 'cargo_worthy' NOT NULL,
	"tare_weight_kg" integer NOT NULL,
	"max_gross_weight_kg" integer NOT NULL,
	"cubic_capacity_m3" numeric(6, 2),
	"operator" text,
	"unlocode" text,
	"depot" text,
	"manufactured_on" date,
	"next_inspection_on" date,
	"reefer_setpoint_c" numeric(4, 1),
	"notes" text,
	"assigned_to_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "containers_number_idx" ON "containers" USING btree ("container_number") WHERE "containers"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "containers_status_idx" ON "containers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "containers_type_idx" ON "containers" USING btree ("type");--> statement-breakpoint
CREATE INDEX "containers_assigned_to_id_idx" ON "containers" USING btree ("assigned_to_id");