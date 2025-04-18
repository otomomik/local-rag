import { fileTypeFromBuffer } from "file-type";

export type FileType =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "text"
  | "document"
  | "other";

// MIMEタイプの判定関数
export const isImage = (mime: string): boolean => mime.startsWith("image/");
export const isVideo = (mime: string): boolean => mime.startsWith("video/");
export const isAudio = (mime: string): boolean => mime.startsWith("audio/");
export const isPdf = (mime: string): boolean => mime === "application/pdf";
export const isText = (mime: string): boolean =>
  mime.startsWith("text/") || mime === "application/json";
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
  if (!fileType) return "other";

  const mime = fileType.mime;
  if (isImage(mime)) return "image";
  if (isVideo(mime)) return "video";
  if (isAudio(mime)) return "audio";
  if (isPdf(mime)) return "pdf";
  if (isText(mime)) return "text";
  if (isDocument(mime)) return "document";

  return "other";
};
