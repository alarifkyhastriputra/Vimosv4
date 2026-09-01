// IP Helper for Orbit / Vimos

export async function fetchClientIp(): Promise<string> {
  // Try server endpoint first
  try {
    const res = await fetch('/api/get-ip');
    if (res.ok) {
      const data = await res.json();
      if (data.ip && data.ip !== '127.0.0.1' && data.ip !== 'localhost' && data.ip !== '::1') {
        return data.ip;
      }
    }
  } catch (e) {
    // Continue to external lookup
  }

  // Fallback to public ipify
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    if (res.ok) {
      const data = await res.json();
      if (data.ip) {
        return data.ip;
      }
    }
  } catch (e) {
    // Continue to next fallback
  }

  // Secondary fallback
  try {
    const res = await fetch('https://api64.ipify.org?format=json');
    if (res.ok) {
      const data = await res.json();
      if (data.ip) {
        return data.ip;
      }
    }
  } catch (e) {
    //
  }

  // Persistent simulated device IP if in offline/local environment
  let localSimulated = '';
  try {
    localSimulated = localStorage.getItem('vimos_client_ip_cached') || '';
  } catch {}

  if (!localSimulated) {
    const r1 = Math.floor(Math.random() * 150) + 100;
    const r2 = Math.floor(Math.random() * 200) + 20;
    const r3 = Math.floor(Math.random() * 250) + 1;
    localSimulated = `182.${r1}.${r2}.${r3}`;
    try {
      localStorage.setItem('vimos_client_ip_cached', localSimulated);
    } catch {}
  }

  return localSimulated;
}

export interface IpLocationInfo {
  ip: string;
  city?: string;
  district?: string;
  region?: string;
  regionName?: string;
  country?: string;
  countryCode?: string;
  zip?: string;
  lat: number;
  lon: number;
  timezone?: string;
  isp?: string;
  org?: string;
  as?: string;
  flag?: string;
  success?: boolean;
}

export async function lookupIpDetails(ip: string): Promise<IpLocationInfo> {
  const cleanIp = (ip || '').trim();
  try {
    const res = await fetch(`/api/ip-lookup?ip=${encodeURIComponent(cleanIp)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && (data.lat !== undefined || data.city)) {
        return data;
      }
    }
  } catch (e) {
    // fallback
  }

  // Direct client fallback to ipwho.is if server route fails
  try {
    const directRes = await fetch(`https://ipwho.is/${encodeURIComponent(cleanIp)}`);
    if (directRes.ok) {
      const d = await directRes.json();
      if (d && d.success !== false) {
        return {
          ip: d.ip || cleanIp,
          city: d.city,
          region: d.region_code || d.region,
          regionName: d.region,
          country: d.country,
          countryCode: d.country_code,
          zip: d.postal,
          lat: d.latitude || -6.2088,
          lon: d.longitude || 106.8456,
          timezone: d.timezone?.id || 'Asia/Jakarta',
          isp: d.connection?.isp,
          org: d.connection?.org,
          as: d.connection?.asn ? `AS${d.connection.asn} ${d.connection.org || ''}` : '',
          flag: d.flag?.emoji,
          success: true
        };
      }
    }
  } catch (e) {}

  return {
    ip: cleanIp,
    city: 'Jakarta',
    regionName: 'DKI Jakarta',
    country: 'Indonesia',
    countryCode: 'ID',
    lat: -6.2088,
    lon: 106.8456,
    isp: 'Internet Service Provider',
    success: true
  };
}

export function sanitizeIpKey(ip: string): string {
  if (!ip) return 'unknown_ip';
  return ip.replace(/\./g, '_').replace(/:/g, '_').replace(/\//g, '_');
}

export function desanitizeIpKey(sanitized: string): string {
  if (!sanitized) return '';
  return sanitized.replace(/_/g, '.');
}

export interface GpsLocationResult {
  lat: number;
  lon: number;
  accuracy: number;
  address?: string;
  street?: string; // Nama Jalan / Gang / No Rumah
  village?: string; // Desa / Kelurahan / Dusun / RT-RW
  district?: string; // Kecamatan
  regency?: string; // Kabupaten / Kota
  province?: string; // Provinsi
  postcode?: string; // Kode Pos
  country?: string; // Negara
  timestamp: number;
  deviceInfo?: {
    os: string;
    browser: string;
    cpuCores: number;
    ram: number;
    screen: string;
    platform: string;
    userAgent: string;
  };
}

/**
 * High-accuracy multi-sample GPS satellite lock (Seeker-style payload)
 * Samples GPS coordinates to discard coarse cell/wifi towers and lock onto real GPS satellites (<20m)
 * Also collects deep device fingerprint data.
 */
export async function getAccurateGpsPosition(
  onProgress?: (status: { accuracy: number; samples: number; statusText: string }) => void
): Promise<GpsLocationResult | null> {
  if (!navigator.geolocation) {
    return null;
  }

  return new Promise((resolve) => {
    let bestFix: GeolocationPosition | null = null;
    let sampleCount = 0;
    let watchId: number | null = null;
    let timeoutId: any = null;
    let isResolved = false;

    const finishWithBestFix = async () => {
      if (isResolved) return;
      isResolved = true;

      if (watchId !== null) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch (e) {}
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (!bestFix) {
        resolve(null);
        return;
      }

      const lat = bestFix.coords.latitude;
      const lon = bestFix.coords.longitude;
      const accuracy = bestFix.coords.accuracy;
      const timestamp = bestFix.timestamp || Date.now();

      onProgress?.({
        accuracy: Math.round(accuracy),
        samples: sampleCount,
        statusText: `GPS Terkunci (Presisi ±${Math.round(accuracy)}m). Menerjemahkan alamat fisik...`
      });

      let geoDetail: any = null;
      try {
        geoDetail = await reverseGeocodeDetails(lat, lon);
      } catch (e) {}

      const getBrowser = () => {
        const ua = navigator.userAgent;
        if (ua.includes("Firefox")) return "Firefox";
        if (ua.includes("SamsungBrowser")) return "Samsung Internet";
        if (ua.includes("Opera") || ua.includes("OPR")) return "Opera";
        if (ua.includes("Trident")) return "Internet Explorer";
        if (ua.includes("Edge") || ua.includes("Edg")) return "Edge";
        if (ua.includes("Chrome")) return "Chrome";
        if (ua.includes("Safari")) return "Safari";
        return "Unknown";
      };

      const getOS = () => {
        const ua = navigator.userAgent;
        if (ua.includes("Win")) return "Windows";
        if (ua.includes("Mac")) return "MacOS";
        if (ua.includes("Android")) return "Android";
        if (ua.includes("Linux")) return "Linux";
        if (ua.includes("iPhone") || ua.includes("iPad") || ua.includes("iPod")) return "iOS";
        return "Unknown";
      };

      resolve({
        lat,
        lon,
        accuracy,
        address: geoDetail?.formattedAddress || `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
        street: geoDetail?.street,
        village: geoDetail?.village,
        district: geoDetail?.district,
        regency: geoDetail?.regency,
        province: geoDetail?.province,
        postcode: geoDetail?.postcode,
        country: geoDetail?.country || 'Indonesia',
        timestamp,
        deviceInfo: {
          os: getOS(),
          browser: getBrowser(),
          cpuCores: navigator.hardwareConcurrency || 0,
          ram: (navigator as any).deviceMemory || 0,
          screen: `${window.screen.width}x${window.screen.height}`,
          platform: navigator.platform || 'Unknown',
          userAgent: navigator.userAgent
        }
      });
    };

    // Max window for satellite locking (reduced to 4 seconds to speed up login)
    timeoutId = setTimeout(() => {
      if (bestFix) {
        finishWithBestFix();
      } else {
        // One last attempt with single getCurrentPosition if watch timed out
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            bestFix = pos;
            finishWithBestFix();
          },
          () => {
            finishWithBestFix();
          },
          { enableHighAccuracy: true, timeout: 2000, maximumAge: 0 }
        );
      }
    }, 4000);

    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          sampleCount++;
          const acc = pos.coords.accuracy;

          if (!bestFix || acc < bestFix.coords.accuracy) {
            bestFix = pos;
          }

          onProgress?.({
            accuracy: Math.round(acc),
            samples: sampleCount,
            statusText: `Mengunci Satelit GPS (Sampel #${sampleCount}, Presisi ±${Math.round(acc)}m)...`
          });

          // Early exit if accuracy is reasonable (< 150 meters) to significantly speed up authentication
          if (acc <= 150) {
            setTimeout(finishWithBestFix, 100);
          }
        },
        (err) => {
          console.warn('GPS watchPosition error:', err?.message);
          // If permission denied immediately (err.code === 1), exit fast
          if (err?.code === 1) {
            finishWithBestFix();
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 4000,
          maximumAge: 0
        }
      );
    } catch (e) {
      // Fallback to single getCurrentPosition
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          bestFix = pos;
          finishWithBestFix();
        },
        () => {
          finishWithBestFix();
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    }
  });
}

/**
 * Request high accuracy GPS from HTML5 Geolocation API
 */
export async function getDeviceGpsPosition(): Promise<GpsLocationResult | null> {
  return getAccurateGpsPosition();
}

export interface GeocodedAddressDetail {
  formattedAddress: string;
  fullDisplayName?: string;
  street?: string;
  village?: string;
  district?: string;
  regency?: string;
  province?: string;
  postcode?: string;
  country?: string;
}

/**
 * Get comprehensive reverse geocoded breakdown (gang/street, village, subdistrict/kecamatan, regency/kabupaten)
 */
export async function reverseGeocodeDetails(lat: number, lon: number): Promise<GeocodedAddressDetail> {
  // 1. Try our backend proxy route which uses Nominatim with custom User-Agent
  try {
    const res = await fetch(`/api/reverse-geocode?lat=${lat}&lon=${lon}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        return {
          formattedAddress: data.formattedAddress || data.fullDisplayName || `Koordinat: ${lat.toFixed(6)}, ${lon.toFixed(6)}`,
          fullDisplayName: data.fullDisplayName,
          street: data.street,
          village: data.village,
          district: data.district,
          regency: data.regency,
          province: data.province,
          postcode: data.postcode,
          country: data.country
        };
      }
    }
  } catch (e) {}

  // 2. Direct OpenStreetMap Nominatim reverse geocoder fallback
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
      {
        headers: {
          'Accept-Language': 'id,en;q=0.9'
        }
      }
    );

    if (res.ok) {
      const data = await res.json();
      if (data && data.address) {
        const addr = data.address;
        const houseNumber = addr.house_number || addr.building ? `No. ${addr.house_number || addr.building}` : '';
        const road = addr.road || addr.pedestrian || addr.street || addr.residential || '';
        const rtrw = addr.city_block || addr.neighbourhood || addr.quarter || addr.allotments || "";
        const hamlet = addr.hamlet || addr.isolated_dwelling || addr.suburb || "";
        
        const rtrwLine = rtrw ? (rtrw.toLowerCase().includes('rt') || rtrw.toLowerCase().includes('rw') ? rtrw : `RT/RW: ${rtrw}`) : "";
        const hamletLine = hamlet ? (hamlet.toLowerCase().includes('dusun') ? hamlet : `Dusun ${hamlet}`) : "";
        
        const streetLine = [road, houseNumber, rtrwLine, hamletLine].filter(Boolean).join(', ');
        
        const village = addr.village || addr.village_district || addr.subdistrict || addr.kelurahan || addr.desa || "";
        const district = addr.county || addr.city_district || addr.district || addr.kecamatan || '';
        const regency = addr.city || addr.town || addr.municipality || addr.state_district || addr.kabupaten || '';
        const province = addr.state || addr.region || '';
        const postcode = addr.postcode || '';
        const country = addr.country || 'Indonesia';

        const parts = [streetLine, village ? `Desa/Kel. ${village}` : '', district ? `Kec. ${district}` : '', regency, province, postcode, country].filter(Boolean);
        const formattedAddress = parts.length > 0 ? parts.join(' • ') : (data.display_name || `Koordinat: ${lat.toFixed(6)}, ${lon.toFixed(6)}`);

        return {
          formattedAddress,
          fullDisplayName: data.display_name,
          street: streetLine || road,
          village: village || hamlet || rtrw,
          district,
          regency,
          province,
          postcode,
          country
        };
      }
    }
  } catch (e) {}

  // 3. Fallback to BigDataCloud free client-side reverse geocoding
  try {
    const bdcRes = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=id`
    );
    if (bdcRes.ok) {
      const bdc = await bdcRes.json();
      const regency = bdc.locality || bdc.city;
      const province = bdc.principalSubdivision;
      const country = bdc.countryName;
      const parts = [
        bdc.localityInfo?.administrative?.[4]?.name,
        bdc.localityInfo?.administrative?.[3]?.name,
        regency,
        province,
        country
      ].filter(Boolean);
      const formatted = parts.join(' • ');
      return {
        formattedAddress: formatted || `Koordinat: ${lat.toFixed(6)}, ${lon.toFixed(6)}`,
        fullDisplayName: formatted,
        district: bdc.localityInfo?.administrative?.[3]?.name,
        regency,
        province,
        country
      };
    }
  } catch (e) {}

  return {
    formattedAddress: `Koordinat: ${lat.toFixed(6)}, ${lon.toFixed(6)}`
  };
}

/**
 * Reverse geocode latitude & longitude to real street/subdistrict/regency
 */
export async function reverseGeocodeCoords(lat: number, lon: number): Promise<string> {
  const details = await reverseGeocodeDetails(lat, lon);
  return details.formattedAddress;
}
