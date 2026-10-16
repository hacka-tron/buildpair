CREATE TABLE `compliments` (
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`tag` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`from_id`, `to_id`, `tag`),
	FOREIGN KEY (`from_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `compliments_to_idx` ON `compliments` (`to_id`);--> statement-breakpoint
CREATE TABLE `profile_stats` (
	`user_id` text PRIMARY KEY NOT NULL,
	`goals_finished` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
