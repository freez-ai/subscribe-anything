CREATE TABLE `email_verification_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code` text NOT NULL,
	`type` text DEFAULT 'register' NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `managed_build_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`step` text NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`payload` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `oauth_config` (
	`id` text PRIMARY KEY DEFAULT 'google' NOT NULL,
	`client_id` text DEFAULT '' NOT NULL,
	`client_secret` text DEFAULT '' NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`state` text NOT NULL,
	`redirect_url` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `smtp_config` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`host` text NOT NULL,
	`port` integer DEFAULT 465 NOT NULL,
	`secure` integer DEFAULT true NOT NULL,
	`user` text NOT NULL,
	`password` text NOT NULL,
	`from_email` text,
	`from_name` text DEFAULT 'Subscribe Anything',
	`require_verification` integer DEFAULT true NOT NULL,
	`provider` text DEFAULT 'smtp' NOT NULL,
	`zeabur_api_key` text,
	`resend_api_key` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`password_hash` text,
	`name` text,
	`avatar_url` text,
	`google_id` text,
	`is_admin` integer DEFAULT false NOT NULL,
	`is_guest` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_id_unique` ON `users` (`google_id`);--> statement-breakpoint
ALTER TABLE `favorites` ADD `user_id` text NOT NULL REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `llm_providers` ADD `created_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `prompt_templates` ADD `user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `rss_instances` ADD `created_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `search_provider_config` ADD `created_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `user_id` text NOT NULL REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `managed_status` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `managed_error` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `wizard_state_json` text;