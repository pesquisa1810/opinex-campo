import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { clearDeviceAuth, getDevice } from '@/lib/device'
import { useAuth } from './useAuth'

export type DeviceState = 'ok' | 'revoked' | 'not_found' | 'wrong_secret' | 'none' | 'not_authenticated'

/** Situação do aparelho SEMPRE confirmada no servidor (não confia só no armazenamento local). */
export function useDevice() {
  const { session } = useAuth()
  const q = useQuery({
    queryKey: ['my-device', session?.user.id],
    enabled: !!session,
    refetchInterval: 60_000,
    queryFn: async (): Promise<{ state: DeviceState; device_id?: string; device_secret?: string }> => {
      const d = getDevice()
      if (!d.device_id || !d.device_secret) return { state: 'none' }
      if (d.user_id && d.user_id !== session!.user.id) return { state: 'none' }
      const { data, error } = await supabase.rpc('my_device_status', { _device: d.device_id, _secret: d.device_secret })
      if (error) throw error
      const state = (data as { status: DeviceState }).status
      if (state === 'not_found' || state === 'wrong_secret') clearDeviceAuth()
      return { state, device_id: d.device_id, device_secret: d.device_secret }
    },
  })
  return { ...q, state: q.data?.state ?? (q.isLoading ? undefined : 'none') }
}
