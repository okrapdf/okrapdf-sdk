import { createSelector } from '@reduxjs/toolkit';
import type { OcrProviderId, OcrProviderConfig, ByokSettings, ValidationResult } from '../types';

interface SettingsState {
  providerConfigs: Record<OcrProviderId, OcrProviderConfig | null>;
  byokSettings: ByokSettings;
  isLoadingSettings: boolean;
  isSavingProvider: OcrProviderId | null;
  isValidatingKey: boolean;
  validationResult: ValidationResult | null;
  error: string | null;
  isHydrated: boolean;
}

type RootStateWithSettings = { settings: SettingsState };

export const selectSettingsState = (state: RootStateWithSettings) => state.settings;

export const selectProviderConfigs = createSelector(
  selectSettingsState,
  (settings) => settings.providerConfigs
);

export const selectByokSettings = createSelector(
  selectSettingsState,
  (settings) => settings.byokSettings
);

export const selectIsLoadingSettings = createSelector(
  selectSettingsState,
  (settings) => settings.isLoadingSettings
);

export const selectIsSavingProvider = createSelector(
  selectSettingsState,
  (settings) => settings.isSavingProvider
);

export const selectIsValidatingKey = createSelector(
  selectSettingsState,
  (settings) => settings.isValidatingKey
);

export const selectValidationResult = createSelector(
  selectSettingsState,
  (settings) => settings.validationResult
);

export const selectSettingsError = createSelector(
  selectSettingsState,
  (settings) => settings.error
);

export const selectIsHydrated = createSelector(
  selectSettingsState,
  (settings) => settings.isHydrated
);

export const selectProviderConfig = (providerId: OcrProviderId) =>
  createSelector(selectProviderConfigs, (configs) => configs[providerId] ?? null);

export const selectIsAnthropicConfigured = createSelector(
  selectProviderConfigs,
  selectByokSettings,
  (configs, byok) => {
    const anthropicConfig = configs['anthropic'];
    if (anthropicConfig?.apiKey) return true;
    return !!byok.enabled && !!byok.anthropicApiKey;
  }
);

export const selectIsOpenRouterConfigured = createSelector(
  selectProviderConfigs,
  selectByokSettings,
  (configs, byok) => {
    const orConfig = configs['openrouter'];
    if (orConfig?.apiKey) return true;
    return !!byok.openrouterApiKey;
  }
);

export const selectHasAnyApiKey = createSelector(
  selectIsAnthropicConfigured,
  selectIsOpenRouterConfigured,
  (anthropic, openrouter) => anthropic || openrouter
);

export const selectAnthropicApiKey = createSelector(
  selectProviderConfigs,
  selectByokSettings,
  (configs, byok) => configs['anthropic']?.apiKey ?? byok.anthropicApiKey ?? null
);
