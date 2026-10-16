CREATE TABLE `blocks` (
	`blocker_id` text NOT NULL,
	`blocked_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`blocker_id`, `blocked_id`),
	FOREIGN KEY (`blocker_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`blocked_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text NOT NULL,
	`target_id` text NOT NULL,
	`space_id` text NOT NULL,
	`message_id` text,
	`body` text,
	`reason` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`reporter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
