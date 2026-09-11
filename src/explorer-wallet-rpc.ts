/**
 * Explorer wallet RPC. Loaded on first call, never at module scope.
 *
 * The Multiplayer Server isolate does not implement `~system/EthereumController`.
 * A static import of it kills the whole scene before `isServer()` can return —
 * punch never boots, and the log is `Unknown module ~system/EthereumController`.
 */
export async function sendAsync(req: {
  id: number
  method: string
  jsonParams: string
}): Promise<{ jsonAnyResponse: string }> {
  const mod = await import('~system/EthereumController')
  return mod.sendAsync(req)
}

export type ExplorerWalletProvider = {
  sendAsync: (
    message: { jsonrpc?: string; id: number; method: string; params?: unknown },
    callback: (err: Error | null, result?: unknown) => void
  ) => void
}

/** Same shape as `@dcl/sdk/ethereum-provider`, without loading that module. */
export function createExplorerWalletProvider(): ExplorerWalletProvider {
  return {
    sendAsync(message, callback) {
      void sendAsync({
        id: message.id,
        method: message.method,
        jsonParams: JSON.stringify(message.params ?? [])
      })
        .then((x) => callback(null, JSON.parse(x.jsonAnyResponse)))
        .catch((err) => callback(err instanceof Error ? err : new Error(String(err))))
    }
  }
}
