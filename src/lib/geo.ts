// Captura ÚNICA de localização no momento da entrevista. Sem rastreamento contínuo,
// sem watchPosition e sem captura em segundo plano. Exige HTTPS.
export type GpsPermission = 'granted' | 'denied' | 'unavailable' | 'timeout'
export interface GpsReading { permission: GpsPermission; latitude?: number; longitude?: number; accuracy?: number; captured_at?: string }

export function captureLocation(timeoutMs = 20000): Promise<GpsReading> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator) || !window.isSecureContext) return resolve({ permission: 'unavailable' })
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({
        permission: 'granted', latitude: p.coords.latitude, longitude: p.coords.longitude,
        accuracy: Math.round(p.coords.accuracy), captured_at: new Date(p.timestamp).toISOString(),
      }),
      (e) => resolve({ permission: e.code === e.PERMISSION_DENIED ? 'denied' : e.code === e.TIMEOUT ? 'timeout' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    )
  })
}

export const gpsLabel: Record<GpsPermission, string> = {
  granted: 'Localização registrada',
  denied: 'Permissão de localização negada',
  unavailable: 'Localização indisponível neste aparelho',
  timeout: 'Tempo esgotado ao obter a localização',
}
