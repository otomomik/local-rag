import { fileTypeFromBuffer } from "file-type";

export type FileType =
  | "text"
  | "html"
  | "pdf"
  | "document"
  | "image"
  | "video"
  | "audio"
  | "other";

// MIMEタイプの判定関数
export const isImage = (mime: string): boolean => mime.startsWith("image/");
export const isVideo = (mime: string): boolean => mime.startsWith("video/");
export const isAudio = (mime: string): boolean => mime.startsWith("audio/");
export const isPdf = (mime: string): boolean => mime === "application/pdf";
const isText = (buffer: Buffer): boolean => {
  const sampleSize = 1000;
  const threshold = 0.1;

  // バッファが空の場合はテキストとみなす
  if (!buffer || buffer.length === 0) {
    return true;
  }

  // サンプリングサイズをバッファサイズに制限
  const size = Math.min(buffer.length, sampleSize);
  const sample = buffer.slice(0, size);

  // 制御文字（0x00-0x08, 0x0B-0x0C, 0x0E-0x1F）のカウント
  // ただし改行(0x0A)とキャリッジリターン(0x0D)は除外
  let controlChars = 0;

  for (let i = 0; i < size; i++) {
    const byte = sample[i];
    if (
      (byte >= 0x00 && byte <= 0x08) ||
      (byte >= 0x0b && byte <= 0x0c) ||
      (byte >= 0x0e && byte <= 0x1f)
    ) {
      controlChars++;
    }
  }

  // 制御文字の割合がしきい値より小さければテキストファイル
  return controlChars / size < threshold;
};
const isHtml = (buffer: Buffer): boolean => {
  // まずテキストファイルかどうか確認
  if (!isText(buffer)) {
    return false;
  }

  // HTMLの特徴的なパターンを探す
  const text = buffer.toString("utf8", 0, 1000).toLowerCase();

  // HTMLの特徴的なタグやドキュメントタイプを確認
  return (
    text.includes("<!doctype html>") ||
    text.includes("<html") ||
    text.includes("<!DOCTYPE html>") ||
    (text.includes("<head") && text.includes("<body")) ||
    (text.includes("<title") && (text.includes("<div") || text.includes("<p")))
  );
};
export const isDocument = (mime: string): boolean =>
  mime ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || // Excel
  mime ===
    "application/vnd.openxmlformats-officedocument.presentationml.presentation" || // PowerPoint
  mime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || // Word
  mime === "application/vnd.ms-excel" || // Old Excel
  mime === "application/vnd.ms-powerpoint" || // Old PowerPoint
  mime === "application/msword"; // Old Word

export const detectFileType = async (buffer: Buffer): Promise<FileType> => {
  const fileType = await fileTypeFromBuffer(buffer);
  const mimeType = fileType?.mime ?? "";

  if (isHtml(buffer)) {
    return "html";
  }

  if (isText(buffer)) {
    return "text";
  }

  if (isPdf(mimeType)) {
    return "pdf";
  }

  if (isDocument(mimeType)) {
    return "document";
  }

  if (isImage(mimeType)) {
    return "image";
  }

  if (isVideo(mimeType)) {
    return "video";
  }

  if (isAudio(mimeType)) {
    return "audio";
  }

  return "other";
};
