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

export function getDBConfigFromVSCode(): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  dbLicid: string;
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
    dbLicid: config.get<string>("dbLicid") || "",
  };
}

export function isDBConfigComplete(config: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  dbLicid: string;
}): boolean {
  return !!(
    config.host &&
    config.port &&
    config.user &&
    config.password &&
    config.database &&
    config.dbLicid
  );
}

export async function fetchAllSettingsDescriptions(): Promise<
  Record<string, string>
> {
  const dbConfig = getDBConfigFromVSCode();
  if (!isDBConfigComplete(dbConfig)) {
    vscode.window.showErrorMessage(
      "PHPDoc Generator: Database configuration is incomplete. Please check your settings.",
      { modal: true }
    );
    return {};
  }
  let connection;
  try {
    connection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
    });
  } catch (err: any) {
    vscode.window.showErrorMessage(
      `PHPDoc Generator: Failed to connect to database. ${
        err && err.message ? err.message : err
      }`,
      { modal: true }
    );
    return {};
  }
  let rows;
  try {
    [rows] = await connection.execute(
      `SELECT s.title, s.description as data
       FROM licence_system_preferences_mapping lm
       JOIN system_preferences s ON(lm.spid = s.spid)
       WHERE s.spsid != 3 `, //and lm.licid = ?
      [dbConfig.dbLicid]
    );
  } catch (err: any) {
    vscode.window.showErrorMessage(
      `PHPDoc Generator: Query error or table not found. ${
        err && err.message ? err.message : err
      }`,
      { modal: true }
    );
    await connection.end();
    return {};
  }
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
  const dbConfig = getDBConfigFromVSCode();
  if (!isDBConfigComplete(dbConfig)) {
    vscode.window.showErrorMessage(
      "PHPDoc Generator: Database configuration is incomplete. Cannot refresh settings cache.",
      { modal: true }
    );
    return;
  }
  // Show a persistent notification and keep a reference to it
  vscode.window.showInformationMessage(
    "Refreshing PHPDoc Generator settings cache...",
    { modal: false }
  );
  const descriptions = await fetchAllSettingsDescriptions();
  if (Object.keys(descriptions).length === 0) {
    // Error already shown by fetchAllSettingsDescriptions
    return;
  }
  fs.writeFileSync(cachePath, JSON.stringify(descriptions, null, 2), "utf-8");
  vscode.window.showInformationMessage(
    "PHPDoc Generator settings cache refreshed."
  );
}
