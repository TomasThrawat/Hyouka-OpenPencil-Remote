export interface DiscoveryInfo {
  authToken?: string | null
  version?: string
  status?: string
  installCommand?: string
  authRequired?: boolean
  discoveryPath?: string
}
