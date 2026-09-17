import React, { useState, useEffect } from 'react';
import { IpLocationInfo, lookupIpDetails, getAccurateGpsPosition, reverseGeocodeDetails } from '../utils/ipHelper';

interface IpLocationModalProps {
  ip: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  userPhoto?: string;
  isBanned?: boolean;
  gpsLat?: number;
  gpsLon?: number;
  gpsAccuracy?: number;
  gpsAddress?: string;
  gpsStreet?: string;
  gpsVillage?: string;
  gpsDistrict?: string;
  gpsRegency?: string;
  gpsProvince?: string;
  gpsPostcode?: string;
  gpsUpdatedAt?: number; 
  deviceInfo?: any;
  onClose: () => void;
  onBanIp?: (ip: string) => void;
  onUnbanIp?: (ip: string) => void;
  onSaveGps?: (userId: string, data: any) => Promise<void>;
}

// Preset Wilayah Kecamatan Kabupaten Bengkayang untuk kalibrasi instan
const BENGKAYANG_PRESETS = [
  { name: 'Kec. Bengkayang (Kota)', lat: 0.8228, lon: 109.6644, note: 'Pusat Kota Bengkayang / Bumi Emas / Sebalo' },
  { name: 'Kec. Sungai Betung', lat: 0.7915, lon: 109.5840, note: 'Karya Bhakti / Suka Maju' },
  { name: 'Kec. Samalantan', lat: 0.7850, lon: 109.4320, note: 'Samalantan / Pastoran' },
  { name: 'Kec. Teriak', lat: 0.8520, lon: 109.5280, note: 'Amboyo / Bana / Teriak' },
  { name: 'Kec. Monterado', lat: 0.7320, lon: 109.1250, note: 'Gerunggang / Monterado' },
  { name: 'Kec. Ledo', lat: 0.9410, lon: 109.7890, note: 'Lesabela / Lembang Ledo' },
  { name: 'Kec. Sanggau Ledo', lat: 1.0820, lon: 109.8450, note: 'Liku / Duginang' },
  { name: 'Kec. Seluas', lat: 1.2150, lon: 109.8920, note: 'Mayak / Sentangau Jaya' },
  { name: 'Kec. Jagoi Babang', lat: 1.3460, lon: 109.9250, note: 'Perbatasan Jagoi Babang' },
  { name: 'Kec. Tujuh Belas', lat: 1.1350, lon: 109.7280, note: 'Pisak / Kamuh' },
  { name: 'Kec. Capkala', lat: 0.6840, lon: 109.1820, note: 'Capkala / Mandor' }
];

export const IpLocationModal: React.FC<IpLocationModalProps> = ({
  ip,
  userId,
  userName,
  userEmail,
  userPhoto,
  isBanned,
  gpsLat: initialGpsLat,
  gpsLon: initialGpsLon,
  gpsAccuracy: initialGpsAccuracy,
  gpsAddress: initialGpsAddress,
  gpsStreet: initialGpsStreet,
  gpsVillage: initialGpsVillage,
  gpsDistrict: initialGpsDistrict,
  gpsRegency: initialGpsRegency,
  gpsProvince: initialGpsProvince,
  gpsPostcode: initialGpsPostcode,
  gpsUpdatedAt: initialGpsUpdatedAt,
  deviceInfo,
  onClose,
  onBanIp,
  onUnbanIp,
  onSaveGps
}) => {
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<IpLocationInfo | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [mapType, setMapType] = useState<'roadmap' | 'satellite'>('roadmap');

  // GPS state
  const [gpsLat, setGpsLat] = useState<number | undefined>(initialGpsLat);
  const [gpsLon, setGpsLon] = useState<number | undefined>(initialGpsLon);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | undefined>(initialGpsAccuracy);
  const [gpsAddress, setGpsAddress] = useState<string | undefined>(initialGpsAddress);
  const [gpsStreet, setGpsStreet] = useState<string | undefined>(initialGpsStreet);
  const [gpsVillage, setGpsVillage] = useState<string | undefined>(initialGpsVillage);
  const [gpsDistrict, setGpsDistrict] = useState<string | undefined>(initialGpsDistrict);
  const [gpsRegency, setGpsRegency] = useState<string | undefined>(initialGpsRegency);
  const [gpsProvince, setGpsProvince] = useState<string | undefined>(initialGpsProvince);
  const [gpsPostcode, setGpsPostcode] = useState<string | undefined>(initialGpsPostcode);
  const [gpsUpdatedAt, setGpsUpdatedAt] = useState<number | undefined>(initialGpsUpdatedAt);
  
  // Live GPS locking state
  const [isRefreshingGps, setIsRefreshingGps] = useState(false);
  const [gpsProgressText, setGpsProgressText] = useState<string | null>(null);

  // Manual Calibration state
  const [showCalibration, setShowCalibration] = useState(false);
  const [customLatInput, setCustomLatInput] = useState('');
  const [customLonInput, setCustomLonInput] = useState('');
  const [isGeocodingCustom, setIsGeocodingCustom] = useState(false);
  const [isSavingGps, setIsSavingGps] = useState(false);

  // Active view source: 'gps' (High accuracy device) or 'ip' (ISP gateway)
  const hasGps = Boolean(gpsLat !== undefined && gpsLon !== undefined && gpsLat !== 0 && gpsLon !== 0);
  const [selectedSource, setSelectedSource] = useState<'gps' | 'ip'>(hasGps ? 'gps' : 'ip');

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    lookupIpDetails(ip).then((data) => {
      if (isMounted) {
        setInfo(data);
        setLoading(false);
      }
    }).catch(() => {
      if (isMounted) {
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [ip]);

  // If GPS becomes available or changes, adjust default view
  useEffect(() => {
    if (initialGpsLat !== undefined && initialGpsLon !== undefined) {
      setGpsLat(initialGpsLat);
      setGpsLon(initialGpsLon);
      setGpsAccuracy(initialGpsAccuracy);
      setGpsAddress(initialGpsAddress);
      setGpsStreet(initialGpsStreet);
      setGpsVillage(initialGpsVillage);
      setGpsDistrict(initialGpsDistrict);
      setGpsRegency(initialGpsRegency);
      setGpsProvince(initialGpsProvince);
      setGpsPostcode(initialGpsPostcode);
      setGpsUpdatedAt(initialGpsUpdatedAt);
      setSelectedSource('gps');

      // If granular parts are missing but coordinates exist, resolve them in background
      if (!initialGpsDistrict && !initialGpsStreet) {
        reverseGeocodeDetails(initialGpsLat, initialGpsLon).then((geo) => {
          if (geo) {
            setGpsStreet(geo.street);
            setGpsVillage(geo.village);
            setGpsDistrict(geo.district);
            setGpsRegency(geo.regency);
            setGpsProvince(geo.province);
            setGpsPostcode(geo.postcode);
            if (geo.formattedAddress) setGpsAddress(geo.formattedAddress);
          }
        }).catch(() => {});
      }
    }
  }, [
    initialGpsLat,
    initialGpsLon,
    initialGpsAccuracy,
    initialGpsAddress,
    initialGpsStreet,
    initialGpsVillage,
    initialGpsDistrict,
    initialGpsRegency,
    initialGpsProvince,
    initialGpsPostcode,
    initialGpsUpdatedAt
  ]);

  const handleRefreshGps = async () => {
    setIsRefreshingGps(true);
    setGpsProgressText('Memulai pencarian sinyal GPS satelit...');
    try {
      const pos = await getAccurateGpsPosition((status) => {
        setGpsProgressText(status.statusText);
      });

      if (pos) {
        setGpsLat(pos.lat);
        setGpsLon(pos.lon);
        setGpsAccuracy(Math.round(pos.accuracy));
        setGpsAddress(pos.address);
        setGpsStreet(pos.street);
        setGpsVillage(pos.village);
        setGpsDistrict(pos.district);
        setGpsRegency(pos.regency);
        setGpsProvince(pos.province);
        setGpsPostcode(pos.postcode);
        setGpsUpdatedAt(Date.now());
        setSelectedSource('gps');

        // If connected to user ID, optionally auto-sync to backend
        if (userId && onSaveGps) {
          onSaveGps(userId, {
            gpsLat: pos.lat,
            gpsLon: pos.lon,
            gpsAccuracy: Math.round(pos.accuracy),
            gpsAddress: pos.address,
            gpsStreet: pos.street,
            gpsVillage: pos.village,
            gpsDistrict: pos.district,
            gpsRegency: pos.regency,
            gpsProvince: pos.province,
            gpsPostcode: pos.postcode,
            gpsUpdatedAt: Date.now()
          }).catch(() => {});
        }
      } else {
        alert('Tidak dapat mengunci sinyal GPS. Pastikan izin lokasi (Allow Location) diaktifkan pada browser/perangkat Anda.');
      }
    } catch (e) {
      alert('Gagal mengambil sensor GPS.');
    } finally {
      setIsRefreshingGps(false);
      setGpsProgressText(null);
    }
  };

  // Apply custom coordinate or preset calibration
  const handleApplyCoordinates = async (targetLat: number, targetLon: number) => {
    setIsGeocodingCustom(true);
    try {
      const geo = await reverseGeocodeDetails(targetLat, targetLon);
      setGpsLat(targetLat);
      setGpsLon(targetLon);
      setGpsAccuracy(5); // Calibrated precision
      setGpsAddress(geo.formattedAddress);
      setGpsStreet(geo.street);
      setGpsVillage(geo.village);
      setGpsDistrict(geo.district);
      setGpsRegency(geo.regency);
      setGpsProvince(geo.province);
      setGpsPostcode(geo.postcode);
      setGpsUpdatedAt(Date.now());
      setSelectedSource('gps');

      if (userId && onSaveGps) {
        setIsSavingGps(true);
        await onSaveGps(userId, {
          gpsLat: targetLat,
          gpsLon: targetLon,
          gpsAccuracy: 5,
          gpsAddress: geo.formattedAddress,
          gpsStreet: geo.street,
          gpsVillage: geo.village,
          gpsDistrict: geo.district,
          gpsRegency: geo.regency,
          gpsProvince: geo.province,
          gpsPostcode: geo.postcode,
          gpsUpdatedAt: Date.now()
        });
        setIsSavingGps(false);
      }
    } catch (e) {
      alert('Gagal mengalibrasi koordinat.');
    } finally {
      setIsGeocodingCustom(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Determine active coordinates and address based on selected tab
  const isGpsActive = selectedSource === 'gps' && gpsLat !== undefined && gpsLon !== undefined;

  const lat = isGpsActive ? gpsLat! : (info?.lat ?? -6.2088);
  const lon = isGpsActive ? gpsLon! : (info?.lon ?? 106.8456);

  const ipAddressString = [
    info?.district,
    info?.city,
    info?.regionName || info?.region,
    info?.zip,
    info?.country
  ].filter(Boolean).join(', ');

  const activeAddress = isGpsActive 
    ? (gpsAddress || `Koordinat GPS: ${gpsLat?.toFixed(6)}, ${gpsLon?.toFixed(6)}`)
    : (ipAddressString || 'Estimasi Server ISP');

  const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lon}`;
  const googleMapsDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
  const embedUrl = `https://maps.google.com/maps?q=${lat},${lon}&t=${mapType === 'satellite' ? 'k' : 'm'}&z=${isGpsActive ? '17' : '13'}&output=embed`;

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="absolute inset-0" onClick={onClose}></div>

      <div className="relative max-w-2xl w-full bg-white rounded-3xl overflow-hidden shadow-2xl border-2 border-black flex flex-col max-h-[92vh] animate-scale-up">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-neutral-950 text-white flex items-center justify-between border-b border-neutral-800">
          <div className="flex items-center space-x-3 min-w-0">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${isGpsActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-white/10 text-neutral-300 border-white/20'}`}>
              <i className={`fas ${isGpsActive ? 'fa-satellite-dish' : 'fa-location-dot'} text-lg`}></i>
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h3 className="text-sm sm:text-base font-black tracking-tight font-mono text-white truncate">
                  {ip}
                </h3>
                {info?.flag && <span className="text-base">{info.flag}</span>}
                {isBanned && (
                  <span className="bg-red-500 text-white text-[8px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider">
                    Banned
                  </span>
                )}
              </div>
              <p className="text-[10px] text-neutral-400 font-bold truncate">
                {userName ? `Target: ${userName} (${userEmail || 'Email'})` : 'Pelacakan Presisi Tempat Tinggal & Gang'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center bg-white/10 hover:bg-white text-neutral-300 hover:text-black rounded-full transition-all shrink-0 ml-2"
          >
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 bg-neutral-50/50">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-10 h-10 border-4 border-neutral-200 border-t-black rounded-full animate-spin"></div>
              <p className="text-xs font-black uppercase tracking-widest text-neutral-500">
                Memindai Geolokasi & Sensor GPS Satelit...
              </p>
            </div>
          ) : (
            <>
              {/* Source Selector: GPS High-Accuracy vs IP ISP Gateway */}
              <div className="p-1.5 bg-neutral-200 rounded-2xl flex flex-col sm:flex-row items-center gap-1.5 border border-neutral-300">
                <button
                  type="button"
                  onClick={() => setSelectedSource('gps')}
                  disabled={!hasGps}
                  className={`w-full sm:flex-1 py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center space-x-2 ${
                    selectedSource === 'gps' && hasGps
                      ? 'bg-emerald-600 text-white shadow-md'
                      : hasGps
                        ? 'bg-white text-neutral-700 hover:bg-neutral-100'
                        : 'opacity-50 bg-neutral-100 text-neutral-400 cursor-not-allowed'
                  }`}
                >
                  <i className="fas fa-satellite-dish text-xs"></i>
                  <span>GPS Fisik ({hasGps ? 'Akurat' : 'Belum Ada Data'})</span>
                  {hasGps && (
                    <span className="bg-emerald-400/30 text-white text-[9px] px-1.5 py-0.2 rounded-md font-mono">
                      ±{gpsAccuracy || 10}m
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedSource('ip')}
                  className={`w-full sm:flex-1 py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center space-x-2 ${
                    selectedSource === 'ip'
                      ? 'bg-black text-white shadow-md'
                      : 'bg-white text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  <i className="fas fa-tower-broadcast text-xs"></i>
                  <span>Server ISP ({info?.city || 'Pontianak'})</span>
                </button>

                <button
                  type="button"
                  onClick={handleRefreshGps}
                  disabled={isRefreshingGps}
                  title="Pindai koordinat GPS satelit perangkat secara langsung dengan akurasi tinggi"
                  className="w-full sm:w-auto py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center space-x-1.5 shrink-0 shadow-xs"
                >
                  <i className={`fas fa-location-crosshairs ${isRefreshingGps ? 'animate-spin' : ''}`}></i>
                  <span>{isRefreshingGps ? 'Mengunci GPS...' : 'Kunci Satelit GPS'}</span>
                </button>
              </div>

              {/* Real-time GPS Locking Progress Banner */}
              {isRefreshingGps && gpsProgressText && (
                <div className="p-3 bg-emerald-50 border-2 border-emerald-500 rounded-2xl flex items-center space-x-3 text-emerald-900 animate-pulse">
                  <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin shrink-0"></div>
                  <div className="text-xs font-bold">{gpsProgressText}</div>
                </div>
              )}

              {/* Informative Explanation Banner & Calibration Toggle */}
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl space-y-2 text-amber-900">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start space-x-2.5">
                    <i className="fas fa-circle-info text-amber-600 text-sm mt-0.5 shrink-0"></i>
                    <div className="text-[11px] leading-relaxed">
                      <span className="font-black block">Kenapa IP Menunjukkan Pontianak?</span>
                      <span className="text-amber-800/90 font-medium">
                        Provider seluler (Telkomsel/Indihome/XL) merutekan jaringan internet Kalimantan Barat melalui Gateway Pusat di Pontianak. 
                        Untuk mengetahui alamat fisik tempat tinggal (Kecamatan, Gang/Jalan di Bengkayang), gunakan <b>GPS Fisik Satelit</b> atau tombol <b>Kalibrasi Presisi</b> di bawah.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCalibration(!showCalibration)}
                    className="shrink-0 px-2.5 py-1 bg-amber-200/80 hover:bg-amber-300 text-amber-950 font-black text-[10px] uppercase tracking-wider rounded-lg transition-all"
                  >
                    <i className="fas fa-sliders mr-1"></i>
                    {showCalibration ? 'Tutup Kalibrasi' : 'Kalibrasi Titik'}
                  </button>
                </div>

                {/* Calibration Sub-panel for Bengkayang Districts */}
                {showCalibration && (
                  <div className="pt-3 mt-2 border-t border-amber-200/80 space-y-3 bg-white/70 p-3 rounded-xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-amber-950 flex items-center space-x-1">
                        <i className="fas fa-bullseye text-amber-600"></i>
                        <span>Pilih Preset Wilayah / Kecamatan Bengkayang</span>
                      </span>
                      {isSavingGps && (
                        <span className="text-[9px] font-bold text-emerald-600">Menyimpan ke Akun...</span>
                      )}
                    </div>

                    {/* Presets Button Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {BENGKAYANG_PRESETS.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          disabled={isGeocodingCustom}
                          onClick={() => handleApplyCoordinates(preset.lat, preset.lon)}
                          className="p-2 text-left bg-white hover:bg-emerald-600 hover:text-white text-neutral-800 border border-neutral-300 rounded-xl transition-all group"
                        >
                          <span className="text-[10px] font-black block truncate group-hover:text-white">{preset.name}</span>
                          <span className="text-[8px] text-neutral-400 block truncate group-hover:text-emerald-100">{preset.note}</span>
                        </button>
                      ))}
                    </div>

                    {/* Manual Lat/Lon input */}
                    <div className="pt-2 border-t border-amber-200/60 flex flex-col sm:flex-row items-center gap-2">
                      <input
                        type="text"
                        placeholder="Latitude (cth: 0.8228)"
                        value={customLatInput}
                        onChange={(e) => setCustomLatInput(e.target.value)}
                        className="w-full sm:flex-1 text-xs px-3 py-2 border border-neutral-300 rounded-xl bg-white focus:outline-none focus:border-black font-mono"
                      />
                      <input
                        type="text"
                        placeholder="Longitude (cth: 109.6644)"
                        value={customLonInput}
                        onChange={(e) => setCustomLonInput(e.target.value)}
                        className="w-full sm:flex-1 text-xs px-3 py-2 border border-neutral-300 rounded-xl bg-white focus:outline-none focus:border-black font-mono"
                      />
                      <button
                        type="button"
                        disabled={!customLatInput || !customLonInput || isGeocodingCustom}
                        onClick={() => {
                          const pLat = parseFloat(customLatInput);
                          const pLon = parseFloat(customLonInput);
                          if (!isNaN(pLat) && !isNaN(pLon)) {
                            handleApplyCoordinates(pLat, pLon);
                          } else {
                            alert('Koordinat tidak valid');
                          }
                        }}
                        className="w-full sm:w-auto px-4 py-2 bg-neutral-900 hover:bg-black text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all disabled:opacity-50"
                      >
                        {isGeocodingCustom ? 'Menerapkan...' : 'Terapkan'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Interactive Map Embed */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-neutral-800 flex items-center space-x-1.5">
                      <i className={`fas ${isGpsActive ? 'fa-satellite text-emerald-600' : 'fa-map-location-dot text-neutral-800'}`}></i>
                      <span>{isGpsActive ? 'Peta GPS Satelit Akurat Tempat Tinggal' : 'Peta Routing Server ISP'}</span>
                    </span>
                    <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-md ${isGpsActive ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-200 text-neutral-800'}`}>
                      {lat.toFixed(6)}, {lon.toFixed(6)}
                    </span>
                  </div>

                  {/* Map Type Switcher */}
                  <div className="flex items-center bg-neutral-200 p-0.5 rounded-lg text-[9px] font-black uppercase">
                    <button
                      type="button"
                      onClick={() => setMapType('roadmap')}
                      className={`px-2 py-1 rounded-md transition-all ${mapType === 'roadmap' ? 'bg-white text-black shadow-2xs' : 'text-neutral-600'}`}
                    >
                      Peta
                    </button>
                    <button
                      type="button"
                      onClick={() => setMapType('satellite')}
                      className={`px-2 py-1 rounded-md transition-all ${mapType === 'satellite' ? 'bg-white text-black shadow-2xs' : 'text-neutral-600'}`}
                    >
                      Satelit
                    </button>
                  </div>
                </div>

                <div className="relative w-full aspect-[16/9] sm:aspect-[21/9] rounded-2xl overflow-hidden border-2 border-black bg-neutral-200 shadow-md">
                  <iframe
                    title="IP & GPS Geolocation Map"
                    src={embedUrl}
                    className="w-full h-full border-0"
                    loading="lazy"
                    allowFullScreen
                  />
                  {/* Pin overlay indicator */}
                  <div className="absolute top-2 right-2 bg-neutral-900/90 backdrop-blur-xs text-white text-[9px] font-bold px-2.5 py-1 rounded-xl shadow-md flex items-center space-x-1.5">
                    <i className={`fas ${isGpsActive ? 'fa-bullseye text-emerald-400 animate-pulse' : 'fa-crosshairs text-amber-400'}`}></i>
                    <span>{isGpsActive ? `Akurasi GPS: ±${gpsAccuracy || 10} Meter` : 'Radius ISP Pontianak'}</span>
                  </div>
                </div>

                {/* Google Maps External Link Actions */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-neutral-900 hover:bg-black text-white py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center space-x-2 transition-all shadow-xs"
                  >
                    <i className="fas fa-arrow-up-right-from-square text-[10px] text-emerald-400"></i>
                    <span>Buka Titik di Google Maps</span>
                  </a>
                  <a
                    href={googleMapsDirectionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-white hover:bg-neutral-100 text-neutral-900 border-2 border-black py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center space-x-2 transition-all shadow-xs"
                  >
                    <i className="fas fa-route text-[10px]"></i>
                    <span>Petunjuk Arah GPS</span>
                  </a>
                </div>
              </div>

              {/* Detailed Breakdown: Kecamatan, Gang/Jalan, Kelurahan/Desa, Kabupaten */}
              <div className="p-4 bg-emerald-950 text-white rounded-3xl border-2 border-emerald-800 shadow-md space-y-3">
                <div className="flex items-center justify-between border-b border-emerald-800/80 pb-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <h4 className="text-xs font-black uppercase tracking-widest text-emerald-300">
                      Rincian Alamat Tempat Tinggal (Wilayah & Gang)
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(activeAddress, 'full_address')}
                    className="text-[10px] font-bold bg-emerald-900/80 hover:bg-emerald-800 text-emerald-200 px-2.5 py-1 rounded-lg transition-all flex items-center space-x-1"
                  >
                    <i className="fas fa-copy text-[9px]"></i>
                    <span>{copiedField === 'full_address' ? 'Tersalin!' : 'Salin Lengkap'}</span>
                  </button>
                </div>

                {/* Granular grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {/* Gang / Nama Jalan */}
                  <div className="bg-emerald-900/50 p-2.5 rounded-2xl border border-emerald-700/60 flex items-start space-x-2.5">
                    <div className="w-7 h-7 rounded-xl bg-emerald-800/80 text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                      <i className="fas fa-road text-xs"></i>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 block">
                        Gang / Nama Jalan / No
                      </span>
                      <p className="text-xs font-black text-white truncate">
                        {gpsStreet || (isGpsActive ? 'Area Pemukiman Terdeteksi' : info?.district || 'Belum Terdata')}
                      </p>
                    </div>
                  </div>

                  {/* Kelurahan / Desa / Dusun */}
                  <div className="bg-emerald-900/50 p-2.5 rounded-2xl border border-emerald-700/60 flex items-start space-x-2.5">
                    <div className="w-7 h-7 rounded-xl bg-emerald-800/80 text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                      <i className="fas fa-house-user text-xs"></i>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 block">
                        Kelurahan / Desa / Dusun
                      </span>
                      <p className="text-xs font-black text-white truncate">
                        {gpsVillage || (isGpsActive ? 'Wilayah Desa Setempat' : info?.city || 'Belum Terdata')}
                      </p>
                    </div>
                  </div>

                  {/* Kecamatan */}
                  <div className="bg-emerald-900/50 p-2.5 rounded-2xl border border-emerald-700/60 flex items-start space-x-2.5">
                    <div className="w-7 h-7 rounded-xl bg-emerald-800/80 text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                      <i className="fas fa-landmark text-xs"></i>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 block">
                        Kecamatan
                      </span>
                      <p className="text-xs font-black text-white truncate">
                        {gpsDistrict ? `Kec. ${gpsDistrict}` : (isGpsActive ? 'Kecamatan Bengkayang' : info?.city || 'Pontianak')}
                      </p>
                    </div>
                  </div>

                  {/* Kabupaten / Kota */}
                  <div className="bg-emerald-900/50 p-2.5 rounded-2xl border border-emerald-700/60 flex items-start space-x-2.5">
                    <div className="w-7 h-7 rounded-xl bg-emerald-800/80 text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                      <i className="fas fa-city text-xs"></i>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 block">
                        Kabupaten / Kota
                      </span>
                      <p className="text-xs font-black text-white truncate">
                        {gpsRegency || (isGpsActive ? 'Kabupaten Bengkayang' : info?.city || 'Pontianak')}
                      </p>
                    </div>
                  </div>

                  {/* Provinsi & Kode Pos */}
                  <div className="bg-emerald-900/50 p-2.5 rounded-2xl border border-emerald-700/60 flex items-start space-x-2.5">
                    <div className="w-7 h-7 rounded-xl bg-emerald-800/80 text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                      <i className="fas fa-map text-xs"></i>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 block">
                        Provinsi & Kode Pos
                      </span>
                      <p className="text-xs font-black text-white truncate">
                        {gpsProvince || info?.regionName || 'Kalimantan Barat'} {gpsPostcode ? `(${gpsPostcode})` : (info?.zip ? `(${info.zip})` : '')}
                      </p>
                    </div>
                  </div>

                  {/* Negara & Akurasi */}
                  <div className="bg-emerald-900/50 p-2.5 rounded-2xl border border-emerald-700/60 flex items-start space-x-2.5">
                    <div className="w-7 h-7 rounded-xl bg-emerald-800/80 text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                      <i className="fas fa-flag text-xs"></i>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 block">
                        Negara & Presisi Sensor
                      </span>
                      <p className="text-xs font-black text-white truncate">
                        {info?.country || 'Indonesia'} • {isGpsActive ? `GPS Satelit (±${gpsAccuracy || 5}m)` : 'Routing ISP'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Formatted Complete String Preview */}
                <div className="p-2.5 bg-black/40 rounded-xl border border-emerald-800/80 text-[11px] font-medium text-emerald-100/90 leading-relaxed">
                  <span className="text-[9px] font-black uppercase text-emerald-400 block mb-0.5">Format Alamat Utuh:</span>
                  {activeAddress}
                </div>
              </div>

              {/* Seeker / Device Info Panel */}
              {deviceInfo && (
                <div className="p-4 bg-neutral-950 text-white rounded-3xl border-2 border-black shadow-md space-y-3">
                  <div className="flex items-center space-x-2 border-b border-neutral-800 pb-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
                    <h4 className="text-xs font-black uppercase tracking-widest text-blue-400">
                      Informasi Perangkat Keras & Browser
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                    <div className="bg-neutral-900 p-2.5 rounded-2xl border border-neutral-800">
                      <span className="text-[8px] font-black uppercase text-neutral-500 block">Sistem Operasi</span>
                      <span className="text-xs font-black text-white">{deviceInfo.os}</span>
                    </div>
                    <div className="bg-neutral-900 p-2.5 rounded-2xl border border-neutral-800">
                      <span className="text-[8px] font-black uppercase text-neutral-500 block">Browser</span>
                      <span className="text-xs font-black text-white">{deviceInfo.browser}</span>
                    </div>
                    <div className="bg-neutral-900 p-2.5 rounded-2xl border border-neutral-800">
                      <span className="text-[8px] font-black uppercase text-neutral-500 block">CPU Cores</span>
                      <span className="text-xs font-black text-white">{deviceInfo.cpuCores || '?'} Cores</span>
                    </div>
                    <div className="bg-neutral-900 p-2.5 rounded-2xl border border-neutral-800">
                      <span className="text-[8px] font-black uppercase text-neutral-500 block">RAM (Memori)</span>
                      <span className="text-xs font-black text-white">~{deviceInfo.ram || '?'} GB</span>
                    </div>
                    <div className="bg-neutral-900 p-2.5 rounded-2xl border border-neutral-800">
                      <span className="text-[8px] font-black uppercase text-neutral-500 block">Resolusi Layar</span>
                      <span className="text-xs font-black text-white">{deviceInfo.screen}</span>
                    </div>
                    <div className="bg-neutral-900 p-2.5 rounded-2xl border border-neutral-800">
                      <span className="text-[8px] font-black uppercase text-neutral-500 block">Platform</span>
                      <span className="text-xs font-black text-white">{deviceInfo.platform}</span>
                    </div>
                  </div>
                  <div className="bg-neutral-900 p-2.5 rounded-xl border border-neutral-800 text-[9px] font-mono text-neutral-400 break-words">
                    <span className="text-[8px] font-black uppercase text-neutral-500 block mb-1">User-Agent Lengkap:</span>
                    {deviceInfo.userAgent}
                  </div>
                </div>
              )}

              {/* Information Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* GPS Coordinates Card */}
                <div className="p-4 bg-white border-2 border-black rounded-2xl shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400 flex items-center space-x-1">
                      <i className="fas fa-compass text-neutral-600"></i>
                      <span>Koordinat Presisi</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(`${lat}, ${lon}`, 'coords')}
                      className="text-[10px] font-bold text-neutral-500 hover:text-black flex items-center space-x-1"
                    >
                      <i className="fas fa-copy text-[9px]"></i>
                      <span>{copiedField === 'coords' ? 'Tersalin!' : 'Salin'}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-neutral-50 p-2 rounded-xl border border-neutral-200">
                      <span className="text-[8px] font-black uppercase text-neutral-400 block">Latitude</span>
                      <span className="text-xs font-mono font-black text-neutral-900">{lat.toFixed(6)}</span>
                    </div>
                    <div className="bg-neutral-50 p-2 rounded-xl border border-neutral-200">
                      <span className="text-[8px] font-black uppercase text-neutral-400 block">Longitude</span>
                      <span className="text-xs font-mono font-black text-neutral-900">{lon.toFixed(6)}</span>
                    </div>
                  </div>
                </div>

                {/* ISP & Network Card */}
                <div className="p-4 bg-white border-2 border-black rounded-2xl shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400 flex items-center space-x-1">
                      <i className="fas fa-tower-broadcast text-neutral-600"></i>
                      <span>Penyedia Internet (ISP)</span>
                    </span>
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-neutral-900 truncate">
                      {info?.isp || info?.org || 'Provider Jaringan'}
                    </h4>
                    {info?.as && (
                      <p className="text-[10px] font-mono text-neutral-500 font-bold truncate mt-0.5">
                        {info.as}
                      </p>
                    )}
                  </div>
                </div>

                {/* Timezone Card */}
                <div className="p-4 bg-white border-2 border-black rounded-2xl shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400 flex items-center space-x-1">
                      <i className="fas fa-clock text-neutral-600"></i>
                      <span>Zona Waktu & Jam</span>
                    </span>
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-neutral-900">
                      {info?.timezone || 'Asia/Jakarta'} (WIB)
                    </h4>
                    <p className="text-[10px] text-neutral-500 font-bold mt-0.5">
                      Waktu Sekarang: {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} WIB
                    </p>
                  </div>
                </div>

                {/* Last update timestamp */}
                <div className="p-4 bg-white border-2 border-black rounded-2xl shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400 flex items-center space-x-1">
                      <i className="fas fa-calendar-check text-neutral-600"></i>
                      <span>Status Pembaruan</span>
                    </span>
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-neutral-900">
                      {isGpsActive && gpsUpdatedAt ? new Date(gpsUpdatedAt).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Realtime Live'}
                    </h4>
                    <p className="text-[10px] text-neutral-500 font-bold mt-0.5">
                      {isGpsActive && gpsUpdatedAt ? `Jam: ${new Date(gpsUpdatedAt).toLocaleTimeString('id-ID')} WIB` : 'Sinkronisasi Otomatis'}
                    </p>
                  </div>
                </div>
              </div>

              {/* User association preview if attached */}
              {userName && (
                <div className="p-3.5 bg-neutral-100 rounded-2xl border border-neutral-300 flex items-center justify-between">
                  <div className="flex items-center space-x-3 min-w-0">
                    {userPhoto && (
                      <img src={userPhoto} alt={userName} className="w-9 h-9 rounded-full border border-black object-cover" />
                    )}
                    <div className="min-w-0">
                      <span className="text-[9px] font-black uppercase text-neutral-500 block">Akun Pemilik IP & GPS</span>
                      <h5 className="text-xs font-black text-neutral-900 truncate">{userName}</h5>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    {isBanned && onUnbanIp && (
                      <button
                        type="button"
                        onClick={() => {
                          onUnbanIp(ip);
                          onClose();
                        }}
                        className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-xs"
                      >
                        Buka Blokir IP
                      </button>
                    )}
                    {!isBanned && onBanIp && (
                      <button
                        type="button"
                        onClick={() => {
                          onBanIp(ip);
                          onClose();
                        }}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-xs"
                      >
                        Blokir IP Ini
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t-2 border-black flex items-center justify-between">
          <button
            type="button"
            onClick={() => handleCopy(`IP: ${ip}\nSumber: ${selectedSource === 'gps' ? 'GPS Sensor Satelit Asli' : 'Server ISP'}\nGang/Jalan: ${gpsStreet || '-'}\nDesa/Kel: ${gpsVillage || '-'}\nKecamatan: ${gpsDistrict || '-'}\nKabupaten: ${gpsRegency || '-'}\nProvinsi: ${gpsProvince || '-'}\nAlamat Utuh: ${activeAddress}\nKoordinat: ${lat}, ${lon}\nGoogle Maps: ${googleMapsUrl}`, 'all')}
            className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center space-x-1.5"
          >
            <i className="fas fa-clipboard-check text-xs"></i>
            <span>{copiedField === 'all' ? 'Semua Info Disalin!' : 'Salin Semua Data'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 bg-black hover:bg-neutral-800 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-xs"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};

export default IpLocationModal;

