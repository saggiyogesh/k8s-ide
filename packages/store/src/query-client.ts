import { QueryClient } from '@tanstack/react-query'
import { createQueryClientDefaults } from './query-keys.js'

let queryClient: QueryClient | null = null

export function getQueryClient(): QueryClient {
  if (!queryClient) {
    queryClient = new QueryClient(createQueryClientDefaults())
  }
  return queryClient
}

export function createQueryClient(): QueryClient {
  return new QueryClient(createQueryClientDefaults())
}
