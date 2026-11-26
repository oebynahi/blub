CREATE TABLE `highlights` (
	`id` text PRIMARY KEY NOT NULL,
	`author` text NOT NULL,
	`slot` text NOT NULL,
	FOREIGN KEY (`author`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `highlight_slot` ON `highlights` (`author`,`slot`);