import { apiRequest } from '../src/api.js'

// Endpoints and fields mirror service/ai/router.py and service/ai/schemas.py.

export function listProviders() {
  return apiRequest('/ai/providers', {
    fallbackMessage: 'Could not load AI providers.',
  })
}

export function listModels(provider) {
  const params = new URLSearchParams({ provider })
  return apiRequest(`/ai/models?${params.toString()}`, {
    fallbackMessage: 'Could not load models for this provider.',
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
