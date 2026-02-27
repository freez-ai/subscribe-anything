CREATE TABLE `favorites` (
	`id` text PRIMARY KEY NOT NULL,
	`original_card_id` text,
	`title` text NOT NULL,
	`summary` text,
	`thumbnail_url` text,
	`source_url` text NOT NULL,
	`published_at` integer,
	`meets_criteria_flag` integer DEFAULT false NOT NULL,
	`criteria_result` text,
	`metric_value` text,
	`subscription_topic` text,
	`source_title` text,
	`favorite_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `llm_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`api_key` text NOT NULL,
	`model_id` text NOT NULL,
	`headers` text,
	`is_active` integer DEFAULT false NOT NULL,
	`total_tokens_used` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `message_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`source_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`thumbnail_url` text,
	`source_url` text NOT NULL,
	`published_at` integer,
	`meets_criteria_flag` integer DEFAULT false NOT NULL,
	`criteria_result` text,
	`metric_value` text,
	`read_at` integer,
	`raw_data` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`is_read` integer DEFAULT false NOT NULL,
	`subscription_id` text,
	`related_entity_type` text,
	`related_entity_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `prompt_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`content` text NOT NULL,
	`default_content` text NOT NULL,
	`provider_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `llm_providers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `rss_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `search_provider_config` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`provider` text DEFAULT 'none' NOT NULL,
	`api_key` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`url` text NOT NULL,
	`script` text DEFAULT '' NOT NULL,
	`cron_expression` text DEFAULT '0 * * * *' NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_run_at` integer,
	`last_run_success` integer,
	`last_error` text,
	`next_run_at` integer,
	`total_runs` integer DEFAULT 0 NOT NULL,
	`success_runs` integer DEFAULT 0 NOT NULL,
	`items_collected` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`topic` text NOT NULL,
	`criteria` text,
	`is_enabled` integer DEFAULT true NOT NULL,
	`unread_count` integer DEFAULT 0 NOT NULL,
	`total_count` integer DEFAULT 0 NOT NULL,
	`last_updated_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
