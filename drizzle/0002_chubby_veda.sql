CREATE TABLE "file_chunks" (
	"parent_hash" text NOT NULL,
	"file_path" text NOT NULL,
	"chunk_index" text NOT NULL,
	"content" text NOT NULL,
	"content_vector" vector(1024) NOT NULL,
	"content_search" text NOT NULL,
	CONSTRAINT "file_chunks_parent_hash_file_path_chunk_index_pk" PRIMARY KEY("parent_hash","file_path","chunk_index")
);
--> statement-breakpoint
DROP INDEX "content_vector_index";--> statement-breakpoint
CREATE INDEX "chunk_vector_index" ON "file_chunks" USING hnsw ("content_vector" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "chunk_search_index" ON "file_chunks" USING gin (to_tsvector('simple', "content_search"));--> statement-breakpoint
ALTER TABLE "files" DROP COLUMN "content_vector";