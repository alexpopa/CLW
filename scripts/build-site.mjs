import { cpSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const options = { stdio: "inherit" };
execFileSync("npm", ["run", "build:accounts"], options);
execFileSync("npm", ["run", "build", "-w", "@lw/client"], {
  ...options,
  env: { ...process.env, VITE_RGBONER_ACCOUNTS: "true" },
});
cpSync("apps/client/dist", "dist/client", { recursive: true });
mkdirSync("dist/.openai", { recursive: true });
cpSync(".openai/hosting.json", "dist/.openai/hosting.json");
