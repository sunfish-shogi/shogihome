import path from "node:path";

export function getAppPath(name: "userData" | "logs" | "exe" | "documents" | "pictures"): string {
  switch (name) {
    case "logs":
      return path.join(process.cwd(), "logs");
    case "exe":
      return process.argv[1];
    default:
      return process.cwd();
  }
}
