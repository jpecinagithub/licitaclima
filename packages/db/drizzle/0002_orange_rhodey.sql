CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"service_alerts" boolean DEFAULT true NOT NULL,
	"weekly_digest" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"tender_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "last_stripe_event_at" bigint;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "category" text DEFAULT 'account' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_org_uq" ON "notification_preferences" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notifications_org_created_idx" ON "notifications" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_org_read_idx" ON "notifications" USING btree ("organization_id","read_at");