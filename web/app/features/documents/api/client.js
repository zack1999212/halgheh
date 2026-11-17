import { apiRequest } from '../../../src/api.js'

/**
 * Documents API client.
 *
 * Endpoint wrappers mirror service/docs/router.py exactly (prefix
 * /documents/v1). Every function returns parsed JSON or null for 204s and
 * throws ApiError on failure, so hooks only deal with data and errors.
 */

const BASE = '/documents/v1'

function queryString(params) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    // Booleans must be sent even when false ("is_deleted=false"), but
    // undefined/null/'' filters are omitted entirely.
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}

// ------------------------------------------------------------- workspaces

export function listWorkspaces({ limit = 200, offset = 0 } = {}) {
  return apiRequest(`${BASE}/workspaces${queryString({ limit, offset })}`, {
    fallbackMessage: 'Could not load workspaces.',
  })
}

export function createWorkspace({ name, description } = {}) {
  return apiRequest(`${BASE}/workspaces`, {
    method: 'POST',
    body: { name, description: description || null },
    fallbackMessage: 'Could not create the workspace.',
  })
}

// ---------------------------------------------------------------- folders

export function listFolders(workspaceId, { limit = 200, offset = 0 } = {}) {
  return apiRequest(
    `${BASE}/folders${queryString({ workspace_id: workspaceId, limit, offset })}`,
    { fallbackMessage: 'Could not load folders.' },
  )
}

export function getFolderTree(workspaceId) {
  return apiRequest(`${BASE}/folders/tree?workspace_id=${workspaceId}`, {
    fallbackMessage: 'Could not load the folder tree.',
  })
}

export function createFolder({ workspaceId, parentId, name } = {}) {
  return apiRequest(`${BASE}/folders`, {
    method: 'POST',
    body: { workspace_id: workspaceId, parent_id: parentId ?? null, name },
    fallbackMessage: 'Could not create the folder.',
  })
}

export function updateFolder(folderId, { name, parentId } = {}) {
  const body = {}
  if (name !== undefined) body.name = name
  // parent_id: null is meaningful (move to workspace root), so it is sent
  // whenever the key is present.
  if (parentId !== undefined) body.parent_id = parentId
  return apiRequest(`${BASE}/folders/${folderId}`, {
    method: 'PATCH',
    body,
    fallbackMessage: 'Could not update the folder.',
  })
}

export function deleteFolder(folderId) {
  return apiRequest(`${BASE}/folders/${folderId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not delete the folder.',
  })
}

// -------------------------------------------------------------- documents

export function listDocuments(filters = {}) {
  return apiRequest(
    `${BASE}/documents${queryString({
      workspace_id: filters.workspaceId,
      folder_id: filters.folderId,
      q: filters.query,
      tag_id: filters.tagId,
      is_favorite: filters.isFavorite,
      is_archived: filters.isArchived,
      is_deleted: filters.isDeleted,
      sort: filters.sort,
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
    })}`,
    { fallbackMessage: 'Could not load documents.' },
  )
}

export function getDocument(documentId) {
  return apiRequest(`${BASE}/documents/${documentId}`, {
    fallbackMessage: 'Could not load the document.',
  })
}

export function createDocument({ workspaceId, folderId, title, content } = {}) {
  return apiRequest(`${BASE}/documents`, {
    method: 'POST',
    body: {
      workspace_id: workspaceId,
      folder_id: folderId ?? null,
      title,
      content: content ?? '',
    },
    fallbackMessage: 'Could not create the document.',
  })
}

export function updateDocument(documentId, patch) {
  const body = {}
  if (patch.title !== undefined) body.title = patch.title
  if (patch.content !== undefined) body.content = patch.content
  if (patch.folderId !== undefined) body.folder_id = patch.folderId
  if (patch.isArchived !== undefined) body.is_archived = patch.isArchived
  return apiRequest(`${BASE}/documents/${documentId}`, {
    method: 'PATCH',
    body,
    fallbackMessage: 'Could not save the document.',
  })
}

/** Soft delete: the document moves to the trash and stays restorable. */
export function trashDocument(documentId) {
  return apiRequest(`${BASE}/documents/${documentId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not move the document to the trash.',
  })
}

export function restoreDocument(documentId) {
  return apiRequest(`${BASE}/documents/${documentId}/restore`, {
    method: 'POST',
    fallbackMessage: 'Could not restore the document.',
  })
}

// ------------------------------------------------------------------- tags

export function listTags(workspaceId, { limit = 200, offset = 0 } = {}) {
  return apiRequest(
    `${BASE}/tags${queryString({ workspace_id: workspaceId, limit, offset })}`,
    { fallbackMessage: 'Could not load tags.' },
  )
}

export function createTag({ workspaceId, name, color } = {}) {
  return apiRequest(`${BASE}/tags`, {
    method: 'POST',
    body: { workspace_id: workspaceId, name, color },
    fallbackMessage: 'Could not create the tag.',
  })
}

export function updateTag(tagId, updates) {
  return apiRequest(`${BASE}/tags/${tagId}`, {
    method: 'PATCH',
    body: updates,
    fallbackMessage: 'Could not update the tag.',
  })
}

export function deleteTag(tagId) {
  return apiRequest(`${BASE}/tags/${tagId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not delete the tag.',
  })
}

export function attachTag(documentId, tagId) {
  return apiRequest(
    `${BASE}/documents/${documentId}/tags${queryString({ tag_id: tagId })}`,
    { method: 'POST', fallbackMessage: 'Could not attach the tag.' },
  )
}

export function detachTag(documentId, tagId) {
  return apiRequest(`${BASE}/documents/${documentId}/tags/${tagId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not remove the tag.',
  })
}

// -------------------------------------------------------------- favorites

export function listFavorites({ limit = 200, offset = 0 } = {}) {
  return apiRequest(`${BASE}/favorites${queryString({ limit, offset })}`, {
    fallbackMessage: 'Could not load favorites.',
  })
}

export function addFavorite(documentId) {
  return apiRequest(`${BASE}/documents/${documentId}/favorite`, {
    method: 'POST',
    fallbackMessage: 'Could not add the favorite.',
  })
}

export function removeFavorite(documentId) {
  return apiRequest(`${BASE}/documents/${documentId}/favorite`, {
    method: 'DELETE',
    fallbackMessage: 'Could not remove the favorite.',
  })
}

// ------------------------------------------------------------------ links

export function getDocumentLinks(documentId) {
  return apiRequest(`${BASE}/documents/${documentId}/links`, {
    fallbackMessage: 'Could not load linked documents.',
  })
}

export function createDocumentLink(documentId, { targetDocumentId, linkType } = {}) {
  return apiRequest(`${BASE}/documents/${documentId}/links`, {
    method: 'POST',
    body: { target_document_id: targetDocumentId, link_type: linkType },
    fallbackMessage: 'Could not link the documents.',
  })
}

export function deleteDocumentLink(documentId, linkId) {
  return apiRequest(`${BASE}/documents/${documentId}/links/${linkId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not remove the link.',
  })
}

// --------------------------------------------------------------- versions

export function listDocumentVersions(documentId, { limit = 50, offset = 0 } = {}) {
  return apiRequest(
    `${BASE}/documents/${documentId}/versions${queryString({ limit, offset })}`,
    { fallbackMessage: 'Could not load the version history.' },
  )
}

export function getDocumentVersion(documentId, versionNumber) {
  return apiRequest(
    `${BASE}/documents/${documentId}/versions/${versionNumber}`,
    { fallbackMessage: 'Could not load the document version.' },
  )
}
