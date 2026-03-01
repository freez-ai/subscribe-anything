CREATE TABLE `analysis_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`html_content` text NOT NULL,
	`card_count` integer DEFAULT 0 NOT NULL,
	`is_starred` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_reset_tokens_token_unique` ON `password_reset_tokens` (`token`);--> statement-breakpoint
ALTER TABLE `smtp_config` ADD `aliyun_directmail_access_key_id` text;--> statement-breakpoint
ALTER TABLE `smtp_config` ADD `aliyun_directmail_access_key_secret` text;--> statement-breakpoint
ALTER TABLE `smtp_config` ADD `aliyun_directmail_region` text DEFAULT 'cn-hangzhou';