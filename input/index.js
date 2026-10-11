export async function loadInput() {
  if (process.platform === "win32") return import("./windows.js");
  if (process.platform === "linux") return import("./linux.js");

  throw new Error(
    `Unsupported OS "${process.platform}". This client supports Linux and Windows.`,
  );
}
