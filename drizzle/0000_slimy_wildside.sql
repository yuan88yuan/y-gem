CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`google_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`picture` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_id_unique` ON `users` (`google_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);