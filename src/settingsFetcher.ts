import * as fs from "fs";
import * as path from "path";
import * as mysql from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;

export function readSettingsCache(cachePath: string): Record<string, string> {
  if (!fs.existsSync(cachePath)) return {};
  return JSON.parse(fs.readFileSync(cachePath, "utf-8"));
}

export async function fetchAllSettingsDescriptions(): Promise<
  Record<string, string>
> {
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  });
  const licid = process.env.LICID;
  // Fetch all settings for this licid
  const [rows] = await connection.execute(
    `SELECT s.title, s.description as data
     FROM licence_system_preferences_mapping lm
     JOIN system_preferences s ON(lm.spid = s.spid)
     WHERE s.spsid != 3 `, //and lm.licid = ?
    [licid]
  );
  const descriptions: Record<string, string> = {};
  if (Array.isArray(rows)) {
    for (const row of rows as any[]) {
      if (row.title) {
        descriptions[row.title] = row.data || "";
      }
    }
  }
  await connection.end();
  return descriptions;
}

export async function updateSettingsCacheAll(cachePath: string) {
  const descriptions = await fetchAllSettingsDescriptions();
  fs.writeFileSync(cachePath, JSON.stringify(descriptions, null, 2), "utf-8");
}
