CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`actor_id` text,
	`kind` text NOT NULL,
	`type` text NOT NULL,
	`outcome` text,
	`note` text DEFAULT '' NOT NULL,
	`ai_assisted` integer DEFAULT false NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activities_lead_time_idx` ON `activities` (`lead_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`before` text,
	`after` text,
	`meta` text,
	`ip` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_log` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text,
	`phone` text,
	`country` text NOT NULL,
	`city` text,
	`age` integer,
	`age_band` text DEFAULT 'UNKNOWN' NOT NULL,
	`language` text NOT NULL,
	`preferred_channel` text NOT NULL,
	`secondary_channel` text,
	`best_time` text DEFAULT 'ANYTIME' NOT NULL,
	`is_returning` integer DEFAULT false NOT NULL,
	`marketing_consent` integer DEFAULT false NOT NULL,
	`search_text` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "customers_contact_chk" CHECK("customers"."email" IS NOT NULL OR "customers"."phone" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `customers_phone_idx` ON `customers` (`phone`);--> statement-breakpoint
CREATE INDEX `customers_email_idx` ON `customers` (`email`);--> statement-breakpoint
CREATE INDEX `customers_search_idx` ON `customers` (`search_text`);--> statement-breakpoint
CREATE TABLE `follow_ups` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`assigned_to` text NOT NULL,
	`due_at` integer NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`note` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	`completed_by_activity_id` text,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`completed_by_activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `follow_ups_assignee_status_due_idx` ON `follow_ups` (`assigned_to`,`status`,`due_at`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`customer_id` text NOT NULL,
	`team_id` text NOT NULL,
	`owner_id` text,
	`source` text NOT NULL,
	`source_detail` text,
	`stage` text DEFAULT 'NEW' NOT NULL,
	`vehicle_model` text,
	`budget_min` integer,
	`budget_max` integer,
	`has_trade_in` integer DEFAULT false NOT NULL,
	`wants_finance` integer DEFAULT false NOT NULL,
	`test_drive_requested` integer DEFAULT false NOT NULL,
	`message` text,
	`score` integer DEFAULT 0 NOT NULL,
	`priority` text DEFAULT 'COOL' NOT NULL,
	`score_breakdown` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`deal_value` integer,
	`applied_offer_id` text,
	`lost_reason` text,
	`lost_note` text,
	`first_response_at` integer,
	`last_activity_at` integer,
	`last_contact_at` integer,
	`assigned_at` integer,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`applied_offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leads_reference_uq` ON `leads` (`reference`);--> statement-breakpoint
CREATE INDEX `leads_owner_stage_idx` ON `leads` (`owner_id`,`stage`);--> statement-breakpoint
CREATE INDEX `leads_team_owner_idx` ON `leads` (`team_id`,`owner_id`);--> statement-breakpoint
CREATE INDEX `leads_created_idx` ON `leads` (`created_at`);--> statement-breakpoint
CREATE INDEX `leads_last_activity_idx` ON `leads` (`last_activity_at`);--> statement-breakpoint
CREATE INDEX `leads_stage_last_contact_idx` ON `leads` (`stage`,`last_contact_at`);--> statement-breakpoint
CREATE INDEX `leads_source_idx` ON `leads` (`source`);--> statement-breakpoint
CREATE INDEX `leads_priority_score_idx` ON `leads` (`priority`,`score`);--> statement-breakpoint
CREATE TABLE `offers` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`discount_type` text NOT NULL,
	`value` integer,
	`valid_from` integer NOT NULL,
	`valid_to` integer NOT NULL,
	`eligibility` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`lead_id` text,
	`vehicle_model` text NOT NULL,
	`amount` integer NOT NULL,
	`purchased_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `purchases_customer_idx` ON `purchases` (`customer_id`);--> statement-breakpoint
CREATE TABLE `stage_history` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`from_stage` text,
	`to_stage` text NOT NULL,
	`changed_by` text,
	`reason` text,
	`changed_at` integer NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stage_history_lead_time_idx` ON `stage_history` (`lead_id`,`changed_at`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`region` text NOT NULL,
	`countries` text NOT NULL,
	`manager_id` text,
	`auto_assign` integer DEFAULT true NOT NULL,
	`assign_strategy` text DEFAULT 'LOAD_BALANCED' NOT NULL,
	`rr_cursor` text
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`manager_id` text,
	`team_id` text,
	`languages` text NOT NULL,
	`avatar_color` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`max_open_leads` integer DEFAULT 25 NOT NULL,
	`last_assigned_at` integer,
	`token_version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`manager_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_manager_idx` ON `users` (`manager_id`);