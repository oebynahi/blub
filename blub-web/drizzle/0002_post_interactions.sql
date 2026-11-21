CREATE TABLE `comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post` text NOT NULL,
	`author` text NOT NULL,
	`body` text NOT NULL,
	`request_id` text NOT NULL,
	FOREIGN KEY (`post`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `comments_post_id` ON `comments` (`post`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `comments_request` ON `comments` (`post`,`author`,`request_id`);--> statement-breakpoint
CREATE TABLE `likes` (
	`post` text NOT NULL,
	`author` text NOT NULL,
	PRIMARY KEY(`post`, `author`),
	FOREIGN KEY (`post`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
