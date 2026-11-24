CREATE TABLE `activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_key` text NOT NULL,
	`recipient` text NOT NULL,
	`actor` text NOT NULL,
	`friendship` text NOT NULL,
	`kind` text NOT NULL,
	`post` text,
	`comment` integer,
	`created` integer NOT NULL,
	`seen` integer DEFAULT 0 NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`recipient`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`friendship`) REFERENCES `friendships`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comment`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_event_key_unique` ON `activity` (`event_key`);--> statement-breakpoint
CREATE INDEX `activity_inbox` ON `activity` (`recipient`,`hidden`,`seen`,`id`);--> statement-breakpoint
CREATE TABLE `push_deliveries` (
	`event` integer NOT NULL,
	`token` text NOT NULL,
	`due` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`event`, `token`),
	FOREIGN KEY (`event`) REFERENCES `activity`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`token`) REFERENCES `notification_devices`(`token`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `push_due` ON `push_deliveries` (`due`);--> statement-breakpoint
CREATE TABLE `notification_devices` (
	`token` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`environment` text NOT NULL,
	`since` integer NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `digest_settings` (
	`owner` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`since` integer NOT NULL,
	`due` integer NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
