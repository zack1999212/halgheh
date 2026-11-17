import { apiRequest } from '../src/api.js'

// Endpoints and fields mirror service/ai/router.py and service/ai/schemas.py.

export function listProviders() {
  return apiRequest('/ai/providers', {
    fallbackMessage: 'Could not load AI providers.',
  })
}

/**
 * List catalogue models. Accepts either a provider id string (legacy call) or
 * an options object with `provider`, `enabledOnly` and `compatibleWithAgent`.
 */
export function listModels(providerOrOptions = {}) {
  const options =
    typeof providerOrOptions === 'string'
      ? { provider: providerOrOptions }
      : providerOrOptions
  const params = new URLSearchParams()
  if (options.provider) params.set('provider', options.provider)
  if (options.enabledOnly) params.set('enabled_only', 'true')
  if (options.compatibleWithAgent) {
    params.set('compatible_with_agent', options.compatibleWithAgent)
  }
  const query = params.toString()
  return apiRequest(`/ai/models${query ? `?${query}` : ''}`, {
    fallbackMessage: 'Could not load models for this provider.',
  })
}

export function createModel(providerId, payload) {
  return apiRequest(`/ai/providers/${encodeURIComponent(providerId)}/models`, {
    method: 'POST',
    body: payload,
    fallbackMessage: 'Could not add the model.',
  })
}

export function updateModel(modelId, payload) {
  return apiRequest(`/ai/models/${modelId}`, {
    method: 'PATCH',
    body: payload,
    fallbackMessage: 'Could not update the model.',
  })
}

export function deleteModel(modelId) {
  return apiRequest(`/ai/models/${modelId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not remove the model.',
  })
}

export function refreshModels(providerId) {
  return apiRequest(
    `/ai/providers/${encodeURIComponent(providerId)}/models/refresh`,
    {
      method: 'POST',
      fallbackMessage: 'Could not refresh the model catalogue.',
    },
  )
}

export function checkModelTools(modelId) {
  return apiRequest(`/ai/models/${modelId}/check-tools`, {
    method: 'POST',
    fallbackMessage: 'Could not run the tool-calling check.',
  })
}

export function getEffectiveConfig() {
  return apiRequest('/ai/config', {
    fallbackMessage: 'Could not load the AI configuration.',
  })
}

export function listCredentials() {
  return apiRequest('/ai/credentials', {
    fallbackMessage: 'Could not load your AI configurations.',
  })
}

export function createCredential(payload) {
  return apiRequest('/ai/credentials', {
    method: 'POST',
    body: payload,
    fallbackMessage: 'Could not save the AI configuration.',
  })
}

export function updateCredential(credentialId, payload) {
  return apiRequest(`/ai/credentials/${credentialId}`, {
    method: 'PATCH',
    body: payload,
    fallbackMessage: 'Could not update the AI configuration.',
  })
}

export function deleteCredential(credentialId) {
  return apiRequest(`/ai/credentials/${credentialId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not remove the AI configuration.',
  })
}

export function activateCredential(credentialId) {
  return apiRequest(`/ai/credentials/${credentialId}/activate`, {
    method: 'POST',
    fallbackMessage: 'Could not activate the AI configuration.',
  })
}

export function revertToDefault() {
  return apiRequest('/ai/revert-to-default', {
    method: 'POST',
    fallbackMessage: 'Could not switch to the application default.',
  })
}
