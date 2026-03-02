PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_analysis_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`html_content` text DEFAULT '' NOT NULL,
	`card_count` integer DEFAULT 0 NOT NULL,
	`is_starred` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_analysis_reports`("id", "subscription_id", "user_id", "title", "description", "html_content", "card_count", "is_starred", "status", "error", "created_at") SELECT "id", "subscription_id", "user_id", "title", "description", "html_content", "card_count", "is_starred", "status", "error", "created_at" FROM `analysis_reports`;--> statement-breakpoint
DROP TABLE `analysis_reports`;--> statement-breakpoint
ALTER TABLE `__new_analysis_reports` RENAME TO `analysis_reports`;--> statement-breakpoint
PRAGMA foreign_keys=ON;