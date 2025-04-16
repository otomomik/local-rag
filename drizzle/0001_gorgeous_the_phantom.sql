ALTER TABLE "files" ADD COLUMN "content_search" text NOT NULL;--> statement-breakpoint
CREATE INDEX "content_search_index" ON "files" USING gin (to_tsvector('english', "content_search"));