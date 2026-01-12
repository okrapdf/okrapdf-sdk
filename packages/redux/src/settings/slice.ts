import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import type {
  OcrProviderId,
  OcrProviderConfig,
  ByokSettings,
  ValidationResult,
  SettingsAdapter,
} from "../types";

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

const initialByokSettings: ByokSettings = {
  enabled: false,
  anthropicApiKey: null,
  openrouterApiKey: null,
};

const initialState: SettingsState = {
  providerConfigs: {},
  byokSettings: initialByokSettings,
  isLoadingSettings: false,
  isSavingProvider: null,
  isValidatingKey: false,
  validationResult: null,
  error: null,
  isHydrated: false,
};

export const loadSettings = createAsyncThunk<
  {
    byokSettings: ByokSettings;
    providerConfigs: Record<string, OcrProviderConfig | null>;
  },
  { adapter: SettingsAdapter },
  { rejectValue: string }
>("settings/loadSettings", async ({ adapter }, { rejectWithValue }) => {
  try {
    const byokSettings = await adapter.loadByokSettings();
    const providers = await adapter.listProviders();
    const providerConfigs: Record<string, OcrProviderConfig | null> = {};

    for (const provider of providers) {
      providerConfigs[provider.id] = await adapter.loadProviderConfig(
        provider.id,
      );
    }

    return {
      byokSettings: byokSettings || initialByokSettings,
      providerConfigs,
    };
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : "Failed to load settings",
    );
  }
});

export const saveProviderConfig = createAsyncThunk<
  { providerId: OcrProviderId; config: OcrProviderConfig },
  {
    providerId: OcrProviderId;
    config: OcrProviderConfig;
    adapter: SettingsAdapter;
  },
  { rejectValue: string }
>(
  "settings/saveProviderConfig",
  async ({ providerId, config, adapter }, { rejectWithValue }) => {
    try {
      await adapter.saveProviderConfig(providerId, config);
      return { providerId, config };
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to save config",
      );
    }
  },
);

export const validateApiKey = createAsyncThunk<
  ValidationResult,
  { provider: string; apiKey: string; adapter: SettingsAdapter },
  { rejectValue: ValidationResult }
>(
  "settings/validateApiKey",
  async ({ provider, apiKey, adapter }, { rejectWithValue }) => {
    try {
      return await adapter.validateApiKey(provider, apiKey);
    } catch (error) {
      return rejectWithValue({
        provider,
        valid: false,
        error: error instanceof Error ? error.message : "Validation failed",
      });
    }
  },
);

export const testProviderHealth = createAsyncThunk<
  ValidationResult & { providerId: OcrProviderId },
  {
    providerId: OcrProviderId;
    config: OcrProviderConfig;
    adapter: SettingsAdapter;
  },
  { rejectValue: ValidationResult & { providerId: OcrProviderId } }
>(
  "settings/testProviderHealth",
  async ({ providerId, config, adapter }, { rejectWithValue }) => {
    try {
      const result = await adapter.testProviderHealth(providerId, config);
      return { ...result, providerId };
    } catch (error) {
      return rejectWithValue({
        providerId,
        provider: providerId,
        valid: false,
        error: error instanceof Error ? error.message : "Health check failed",
      });
    }
  },
);

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    setProviderConfig: (
      state,
      action: PayloadAction<{
        providerId: OcrProviderId;
        config: OcrProviderConfig;
      }>,
    ) => {
      state.providerConfigs[action.payload.providerId] = action.payload.config;
    },

    setByokSettings: (state, action: PayloadAction<Partial<ByokSettings>>) => {
      state.byokSettings = { ...state.byokSettings, ...action.payload };
    },

    clearValidationResult: (state) => {
      state.validationResult = null;
    },

    clearSettingsError: (state) => {
      state.error = null;
    },

    markHydrated: (state) => {
      state.isHydrated = true;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadSettings.pending, (state) => {
        state.isLoadingSettings = true;
        state.error = null;
      })
      .addCase(loadSettings.fulfilled, (state, action) => {
        state.isLoadingSettings = false;
        state.byokSettings = action.payload.byokSettings;
        state.providerConfigs = action.payload.providerConfigs;
        state.isHydrated = true;
      })
      .addCase(loadSettings.rejected, (state, action) => {
        state.isLoadingSettings = false;
        state.error = action.payload as string;
        state.isHydrated = true;
      });

    builder
      .addCase(saveProviderConfig.pending, (state, action) => {
        state.isSavingProvider = action.meta.arg.providerId;
      })
      .addCase(saveProviderConfig.fulfilled, (state, action) => {
        state.isSavingProvider = null;
        state.providerConfigs[action.payload.providerId] =
          action.payload.config;

        if (
          action.payload.providerId === "anthropic" &&
          action.payload.config.apiKey
        ) {
          state.byokSettings.enabled = true;
          state.byokSettings.anthropicApiKey = action.payload.config.apiKey;
        }
        if (
          action.payload.providerId === "openrouter" &&
          action.payload.config.apiKey
        ) {
          state.byokSettings.openrouterApiKey = action.payload.config.apiKey;
        }
      })
      .addCase(saveProviderConfig.rejected, (state, action) => {
        state.isSavingProvider = null;
        state.error = action.payload as string;
      });

    builder
      .addCase(validateApiKey.pending, (state) => {
        state.isValidatingKey = true;
        state.validationResult = null;
      })
      .addCase(validateApiKey.fulfilled, (state, action) => {
        state.isValidatingKey = false;
        state.validationResult = action.payload;
      })
      .addCase(validateApiKey.rejected, (state, action) => {
        state.isValidatingKey = false;
        state.validationResult = action.payload as ValidationResult;
      });

    builder
      .addCase(testProviderHealth.pending, (state) => {
        state.isValidatingKey = true;
      })
      .addCase(testProviderHealth.fulfilled, (state, action) => {
        state.isValidatingKey = false;
        state.validationResult = {
          provider: action.payload.providerId,
          valid: action.payload.valid,
          error: action.payload.error,
        };
      })
      .addCase(testProviderHealth.rejected, (state, action) => {
        state.isValidatingKey = false;
        const payload = action.payload as ValidationResult & {
          providerId: string;
        };
        state.validationResult = {
          provider: payload.providerId,
          valid: false,
          error: payload.error,
        };
      });
  },
});

export const {
  setProviderConfig,
  setByokSettings,
  clearValidationResult,
  clearSettingsError,
  markHydrated,
} = settingsSlice.actions;

export default settingsSlice.reducer;
