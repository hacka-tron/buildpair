CREATE TABLE `account_erasures` (
	`user_id` text PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
