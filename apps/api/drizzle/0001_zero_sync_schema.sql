-- Upgrade legacy zero_sync_records (old proofloop seed) to current Zero CRM audit schema
DROP TABLE IF EXISTS "zero_sync_records";--> statement-breakpoint
CREATE TABLE "zero_sync_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"external_id" text NOT NULL,
	"status" text DEFAULT 'not_synced' NOT NULL,
	"zero_id" text,
	"zero_url" text,
	"error" text,
	"last_payload" jsonb,
	"last_response" jsonb,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "zero_sync_records_entity_unique" ON "zero_sync_records" USING btree ("workspace_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "zero_sync_records_external_unique" ON "zero_sync_records" USING btree ("external_id");
