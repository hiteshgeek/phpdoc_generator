import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as mysql from "mysql2/promise";

export function readSettingsCache(cachePath: string): Record<string, string> {
  if (!fs.existsSync(cachePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(cachePath, "utf-8"));
  } catch (e) {
    // If cache is empty or invalid, return empty object
    return {};
  }
}

function getDBConfigFromVSCode(): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  licid: string;
} {
  const config = vscode.workspace.getConfiguration(
    "phpdoc-generator-hiteshgeek"
  );
  console.log("VS Code Config:", JSON.stringify(config));
  return {
    host: config.get<string>("dbHost") || "",
    port: config.get<number>("dbPort") || 3306,
    user: config.get<string>("dbUser") || "",
    password: config.get<string>("dbPassword") || "",
    database: config.get<string>("dbName") || "",
    licid: config.get<string>("licid") || "",
  };
}

export async function fetchAllSettingsDescriptions(): Promise<
  Record<string, string>
> {
  const dbConfig = getDBConfigFromVSCode();
  const connection = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
  });
  // Fetch all settings for this licid
  const [rows] = await connection.execute(
    `SELECT s.title, s.description as data
     FROM licence_system_preferences_mapping lm
     JOIN system_preferences s ON(lm.spid = s.spid)
     WHERE s.spsid != 3 `, //and lm.licid = ?
    [dbConfig.licid]
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

export async function updateSettingsCacheAll(cachePath: string): Promise<void> {
  // Show a persistent notification and keep a reference to it
  const refreshing = vscode.window.showInformationMessage(
    "Refreshing PHPDoc Generator settings cache...",
    { modal: false }
  );
  const descriptions = await fetchAllSettingsDescriptions();
  fs.writeFileSync(cachePath, JSON.stringify(descriptions, null, 2), "utf-8");
  // There is no direct way to programmatically close a notification in VS Code API,
  // but we can show the 'finished' message and rely on the user to see the update.
  vscode.window.showInformationMessage(
    "PHPDoc Generator settings cache refreshed."
  );
}
