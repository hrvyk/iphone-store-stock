CREATE TABLE `monitor_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`outcome` text NOT NULL,
	`detail` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monitor_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`snapshot` text NOT NULL,
	`lock_token` text,
	`lock_until` integer DEFAULT 0 NOT NULL,
	`next_allowed_at` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` text,
	`last_success_at` text,
	`catalog_verified_at` text,
	`background_enabled` integer DEFAULT 0 NOT NULL,
	`last_background_at` text
);
