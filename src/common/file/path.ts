export const defaultRecordFileNameTemplate = "{datetime}{_title}{_sente}{_gote}";

export function escapeFileName(path: string): string {
  return path.replaceAll(/[<>:"/\\|?*]/g, "_");
}
