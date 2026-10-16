CREATE TABLE `listings` (
	`space_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`purpose` text NOT NULL,
	`owner_name` text NOT NULL,
	`goals` text NOT NULL,
	`people` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `listings_updated_idx` ON `listings` (`updated_at`);--> statement-breakpoint
ALTER TABLE `join_requests` ADD `note` text;