CREATE INDEX `friendships_sender_status` ON `friendships` (`sender`,`status`);--> statement-breakpoint
CREATE INDEX `friendships_recipient_status` ON `friendships` (`recipient`,`status`);--> statement-breakpoint
CREATE INDEX `posts_author_date` ON `posts` (`author`,`created_at`);