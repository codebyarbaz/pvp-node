import { KEY_MAP } from "./key_map.js";

export const ALLOWED_KEYS = new Set(
  Object.values(KEY_MAP).flatMap((map) => Object.values(map)),
);
