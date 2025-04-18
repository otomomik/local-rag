import path from "path";
import { fileURLToPath } from "url";

// プロジェクトのルートディレクトリ
export const projectRootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// ディレクトリ関連の設定
export const dirConfig = {
  baseDir: process.cwd(),
  getTargetDir: (arg?: string) => arg || ".",
};

// サーバー関連の設定
export const serverConfig = {
  name: "Local Rag",
  version: "0.0.1",
};

// データベース関連の設定
export const dbConfig = {
  dataDir: path.join(projectRootDir, ".pglite"),
  migrationsFolder: path.join(projectRootDir, "drizzle"),
};

// ログ関連の設定
export const logConfig = {
  logsDir: path.join(projectRootDir, ".logs"),
};

// ファイル処理関連の設定
export const fileConfig = {
  chunkSize: 1000, // チャンクサイズ（文字数）
  chunkOverlap: 200, // チャンク間のオーバーラップ（文字数）
};

// モデル関連の設定
export const modelConfig = {
  embeddingModel: "mlx-community/snowflake-arctic-embed-l-v2.0-bf16",
  imageModel: "mlx-community/gemma-3-27b-it-4bit",
  videoModel: "mlx-community/Qwen2.5-VL-32B-Instruct-4bit",
  audioModel: "mlx-community/whisper-large-v3-turbo",
};

// スクリプト関連の設定
export const scriptConfig = {
  textToVector: path.join(projectRootDir, "scripts/text_to_vector.sh"),
  documentToMarkdown: path.join(
    projectRootDir,
    "scripts/document_to_markdown.sh",
  ),
  htmlToMarkdown: path.join(projectRootDir, "scripts/html_to_markdown.sh"),
  imageToText: path.join(projectRootDir, "scripts/image_to_text.sh"),
  videoToText: path.join(projectRootDir, "scripts/video_to_text.sh"),
  audioToText: path.join(projectRootDir, "scripts/audio_to_text.sh"),
};
