import { z } from "zod";

export const folderNameSchema = z.string().trim().min(1, "Enter a folder name").max(120, "Keep the name under 120 characters");