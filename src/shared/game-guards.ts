export const GUARDED_GAMES = {
  finals: { name: 'The Finals', images: ['discovery.exe', 'discovery-e.exe'] },
  battlefield: { name: 'Battlefield', images: ['bf6.exe', 'bf2042.exe', 'bfv.exe', 'bf1.exe', 'bf4.exe'] },
  siege: { name: 'Rainbow Six Siege', images: ['rainbowsix.exe', 'rainbowsix_dx11.exe', 'rainbowsix_vulkan.exe'] },
  destiny: { name: 'Destiny 2', images: ['destiny2.exe'] }
} as const
export type GuardedGame = keyof typeof GUARDED_GAMES
export interface GameGuardStatus { enabled: boolean; armed: boolean; message: string; alert: string | null }
export type GameGuardStatuses = Record<GuardedGame, GameGuardStatus>
export function isGuardedGame(value: unknown): value is GuardedGame {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(GUARDED_GAMES, value)
}
