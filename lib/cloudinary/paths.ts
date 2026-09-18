import config from "../config/config.ts";

export function cloudinaryFolder(subfolder: string): string {
  const environment = config.environment;
  if (!environment || !["production", "development", "test"].includes(environment)) {
    throw new Error("NODE_ENV must be production, development, or test for Cloudinary uploads.");
  }
  if (!subfolder.split("/").every((segment) => /^[A-Za-z0-9_-]+$/.test(segment))) {
    throw new Error("Cloudinary folder segments may contain only letters, digits, underscores, and hyphens.");
  }
  return `Canopy/${environment}/${subfolder}`;
}
