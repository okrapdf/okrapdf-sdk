/**
 * okra auth - Manage authentication
 *
 * Usage:
 *   okra auth login              # Set API key in global config
 *   okra auth status             # Show current auth status
 *   okra auth logout             # Remove API key from global config
 */

import { readGlobalConfig, writeGlobalConfig, getApiKey, getApiKeySource, getGlobalConfigPath } from '../config';
import * as readline from 'readline';

/**
 * Prompt user for input.
 */
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Login command - set API key in global config.
 */
export async function authLogin(): Promise<void> {
  console.log('okra CLI Authentication');
  console.log('');
  console.log('Get your API key from: https://app.okrapdf.com/settings/api');
  console.log('');

  const apiKey = await prompt('Enter your API key: ');

  if (!apiKey) {
    console.error('Error: API key cannot be empty');
    process.exit(1);
  }

  if (!apiKey.startsWith('okra_')) {
    console.warn('Warning: API key should start with "okra_"');
  }

  // Read existing config or create new one
  const config = readGlobalConfig() || {};
  config.apiKey = apiKey;

  // Write to global config
  writeGlobalConfig(config);

  console.log('');
  console.log(`✓ API key saved to ${getGlobalConfigPath()}`);
  console.log('');
  console.log('You can now use okra commands without setting OKRA_API_KEY');
}

/**
 * Status command - show current auth status.
 */
export async function authStatus(): Promise<void> {
  const apiKey = getApiKey();
  const source = getApiKeySource();

  console.log('okra CLI Authentication Status');
  console.log('');

  if (apiKey) {
    const maskedKey = apiKey.slice(0, 10) + '...' + apiKey.slice(-4);
    console.log(`✓ Authenticated: ${maskedKey}`);
    console.log(`  Source: ${source}`);
  } else {
    console.log('✗ Not authenticated');
    console.log('');
    console.log('Set API key via:');
    console.log('  okra auth login');
    console.log('  export OKRA_API_KEY="okra_xxx"');
  }

  console.log('');
}

/**
 * Logout command - remove API key from global config.
 */
export async function authLogout(): Promise<void> {
  const config = readGlobalConfig();

  if (!config || !config.apiKey) {
    console.log('No API key found in global config');
    return;
  }

  // Remove API key but keep other config
  delete config.apiKey;
  writeGlobalConfig(config);

  console.log(`✓ API key removed from ${getGlobalConfigPath()}`);
  console.log('');
  console.log('Note: Environment variables and project configs are not affected');
}
