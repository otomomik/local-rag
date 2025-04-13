CREATE TABLE "files" (
	"parent_hash" text NOT NULL,
	"path" text NOT NULL,
	"content_hash" text NOT NULL,
	"content" text NOT NULL,
	"content_vector" vector(1024) NOT NULL,
	CONSTRAINT "files_parent_hash_path_pk" PRIMARY KEY("parent_hash","path")
);
--> statement-breakpoint
CREATE INDEX "content_vector_index" ON "files" USING hnsw ("content_vector" vector_cosine_ops);