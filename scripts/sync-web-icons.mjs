import { copyFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
copyFileSync(
  join(root, "src-tauri/icons/32x32.png"),
  join(root, "public/favicon.png"),
);
copyFileSync(
  join(root, "src-tauri/icons/128x128.png"),
  join(root, "public/apple-touch-icon.png"),
);
