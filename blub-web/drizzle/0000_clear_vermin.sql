CREATE TABLE `friendships` (
	`id` text PRIMARY KEY NOT NULL,
	`sender` text NOT NULL,
	`recipient` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sender`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`author` text NOT NULL,
	`caption` text NOT NULL,
	`photo` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`author`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`handle` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_unique` ON `users` (`handle`);