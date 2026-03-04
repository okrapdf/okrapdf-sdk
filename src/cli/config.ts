/**
 * Configuration management for okra CLI
 *
 * Priority order (highest to lowest):
 * 1. Environment variable: OKRA_API_KEY
 * 2. Project config: .okrarc or .okra.json in current directory
 * 3. Global config: ~/.okra/config.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface OkraConfig {
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Get the global config directory path.
 * Supports XDG_CONFIG_HOME convention.
 */
export function getGlobalConfigDir(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  if (xdgConfigHome) {
    return join(xdgConfigHome, 'okra');
  }
  return join(homedir(), '.okra');
}

/**
 * Get the global config file path.
 */
export function getGlobalConfigPath(): string {
  return join(getGlobalConfigDir(), 'config.json');
}

/**
 * Read global config from ~/.okra/config.json
 */
export function readGlobalConfig(): OkraConfig | null {
  try {
    const configPath = getGlobalConfigPath();
    if (!existsSync(configPath)) {
      return null;
    }
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    // Silently fail and return null
    return null;
  }
}

/**
 * Write global config to ~/.okra/config.json
 */
export function writeGlobalConfig(config: OkraConfig): void {
  const configDir = getGlobalConfigDir();
  const configPath = getGlobalConfigPath();

  // Create directory if it doesn't exist
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Find and read project config from current directory.
 * Checks for .okrarc and .okra.json
 */
export function readProjectConfig(): OkraConfig | null {
  const projectFiles = ['.okrarc', '.okra.json'];

  for (const filename of projectFiles) {
    try {
      const path = join(process.cwd(), filename);
      if (existsSync(path)) {
        const content = readFileSync(path, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      // Continue to next file
      continue;
    }
  }

  return null;
}

/**
 * Get API key from all sources with proper priority.
 *
 * Priority order:
 * 1. Environment variable: OKRA_API_KEY
 * 2. Project config: .okrarc or .okra.json
 * 3. Global config: ~/.okra/config.json
 */
export function getApiKey(): string | undefined {
  // 1. Check environment variable
  if (process.env.OKRA_API_KEY) {
    return process.env.OKRA_API_KEY;
  }

  // 2. Check project config
  const projectConfig = readProjectConfig();
  if (projectConfig?.apiKey) {
    return projectConfig.apiKey;
  }

  // 3. Check global config
  const globalConfig = readGlobalConfig();
  if (globalConfig?.apiKey) {
    return globalConfig.apiKey;
  }

  return undefined;
}

/**
 * Get base URL from all sources with proper priority.
 */
export function getBaseUrl(): string | undefined {
  // 1. Check environment variable
  if (process.env.OKRA_BASE_URL) {
    return process.env.OKRA_BASE_URL;
  }

  // 2. Check project config
  const projectConfig = readProjectConfig();
  if (projectConfig?.baseUrl) {
    return projectConfig.baseUrl;
  }

  // 3. Check global config
  const globalConfig = readGlobalConfig();
  if (globalConfig?.baseUrl) {
    return globalConfig.baseUrl;
  }

  return 'https://api.okrapdf.com';
}

/**
 * Get source of API key for debugging.
 */
export function getApiKeySource(): string {
  if (process.env.OKRA_API_KEY) {
    return 'environment variable (OKRA_API_KEY)';
  }

  const projectConfig = readProjectConfig();
  if (projectConfig?.apiKey) {
    const files = ['.okrarc', '.okra.json'];
    for (const f of files) {
      if (existsSync(join(process.cwd(), f))) {
        return `project config (${f})`;
      }
    }
  }

  const globalConfig = readGlobalConfig();
  if (globalConfig?.apiKey) {
    return `global config (${getGlobalConfigPath()})`;
  }

  return 'not found';
}
