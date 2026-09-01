import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  // Helper for lazy initializing Gemini
  let aiClient: GoogleGenAI | null = null;
  function getGeminiClient(): GoogleGenAI | null {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return null;
    }
    if (!aiClient) {
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
    return aiClient;
  }

  // Health check API
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", aiEnabled: !!process.env.GEMINI_API_KEY });
  });

  // Client IP discovery endpoint
  app.get("/api/get-ip", (req, res) => {
    try {
      const forwarded = req.headers["x-forwarded-for"];
      let clientIp = "";
      if (typeof forwarded === "string") {
        clientIp = forwarded.split(",")[0].trim();
      } else if (Array.isArray(forwarded) && forwarded[0]) {
        clientIp = forwarded[0].trim();
      } else {
        clientIp = (req.socket.remoteAddress || req.ip || "127.0.0.1").replace(/^.*:/, "");
      }
      res.json({ ip: clientIp || "127.0.0.1" });
    } catch (e) {
      res.json({ ip: "127.0.0.1" });
    }
  });

  // IP Geolocation & Address lookup endpoint with resilient fallbacks
  app.get("/api/ip-lookup", async (req, res) => {
    try {
      const rawIp = (req.query.ip as string || "").trim();
      if (!rawIp || rawIp === "127.0.0.1" || rawIp === "localhost" || rawIp === "::1") {
        return res.json({
          ip: rawIp || "127.0.0.1",
          city: "Jakarta",
          region: "DKI Jakarta",
          regionName: "Daerah Khusus Ibukota Jakarta",
          country: "Indonesia",
          countryCode: "ID",
          zip: "10110",
          lat: -6.2088,
          lon: 106.8456,
          timezone: "Asia/Jakarta",
          isp: "Localhost / Sandbox Carrier",
          org: "Orbit Local Environment",
          as: "AS12345 Local Gateway",
          query: rawIp || "127.0.0.1",
          success: true
        });
      }

      // 1. Try ipwho.is first (supports HTTPS, rich accurate fields)
      try {
        const whoisRes = await fetch(`https://ipwho.is/${encodeURIComponent(rawIp)}`);
        if (whoisRes.ok) {
          const data = await whoisRes.json();
          if (data && data.success !== false) {
            return res.json({
              ip: data.ip || rawIp,
              city: data.city || "",
              region: data.region_code || data.region || "",
              regionName: data.region || "",
              country: data.country || "",
              countryCode: data.country_code || "",
              zip: data.postal || "",
              lat: data.latitude || 0,
              lon: data.longitude || 0,
              timezone: data.timezone?.id || data.timezone || "",
              isp: data.connection?.isp || "",
              org: data.connection?.org || "",
              as: data.connection?.asn ? `AS${data.connection.asn} ${data.connection.org || ''}` : "",
              flag: data.flag?.emoji || "",
              query: rawIp,
              success: true
            });
          }
        }
      } catch (err) {}

      // 2. Try ip-api.com as fallback
      try {
        const ipApiRes = await fetch(`http://ip-api.com/json/${encodeURIComponent(rawIp)}?fields=status,message,continent,country,countryCode,region,regionName,city,district,zip,lat,lon,timezone,offset,currency,isp,org,as,query`);
        if (ipApiRes.ok) {
          const data = await ipApiRes.json();
          if (data && data.status === "success") {
            return res.json({
              ip: data.query || rawIp,
              city: data.city || "",
              district: data.district || "",
              region: data.region || "",
              regionName: data.regionName || "",
              country: data.country || "",
              countryCode: data.countryCode || "",
              zip: data.zip || "",
              lat: data.lat || 0,
              lon: data.lon || 0,
              timezone: data.timezone || "",
              isp: data.isp || "",
              org: data.org || "",
              as: data.as || "",
              query: rawIp,
              success: true
            });
          }
        }
      } catch (err) {}

      // 3. Fallback coordinate estimate if lookup fails
      return res.json({
        ip: rawIp,
        city: "Jakarta",
        regionName: "DKI Jakarta",
        country: "Indonesia",
        countryCode: "ID",
        lat: -6.2088,
        lon: 106.8456,
        isp: "Internet Service Provider",
        query: rawIp,
        success: true
      });
    } catch (e: any) {
      res.status(500).json({ error: "Gagal mengambil data lokasi IP", message: e?.message });
    }
  });

  // Reverse Geocoding endpoint to convert coordinates (lat, lon) into detailed physical street, village, district & regency
  app.get("/api/reverse-geocode", async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lon = parseFloat(req.query.lon as string);

      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: "Latitude dan Longitude harus berupa angka valid" });
      }

      // 1. Query OpenStreetMap Nominatim with explicit User-Agent & highest zoom 18
      try {
        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&extratags=1&namedetails=1`,
          {
            headers: {
              "User-Agent": "VimosSocialApp/2.0 (Admin Geolocation Module; contact: admin@vimos.social)",
              "Accept-Language": "id,id-ID;q=0.9,en;q=0.8"
            }
          }
        );

        if (nomRes.ok) {
          const data = await nomRes.json();
          if (data && data.address) {
            const addr = data.address;
            const houseNumber = addr.house_number || addr.building || "";
            const road = addr.road || addr.street || addr.residential || addr.pedestrian || addr.footway || addr.path || "";
            const rtrw = addr.city_block || addr.neighbourhood || addr.quarter || addr.allotments || ""; // often captures RT/RW
            const hamlet = addr.hamlet || addr.isolated_dwelling || addr.suburb || ""; // often captures Dusun
            const village = addr.village || addr.village_district || addr.subdistrict || addr.kelurahan || addr.desa || "";
            const district = addr.county || addr.city_district || addr.district || addr.kecamatan || "";
            const regency = addr.city || addr.town || addr.municipality || addr.state_district || addr.kabupaten || "";
            const province = addr.state || addr.region || addr.provinsi || "Kalimantan Barat";
            const postcode = addr.postcode || "";
            const country = addr.country || "Indonesia";

            // Formulate precise readable street and home area address
            const streetLine = [road, houseNumber ? `No. ${houseNumber}` : ""].filter(Boolean).join(" ");
            
            // Format RT/RW or environment string if it exists
            const rtrwLine = rtrw ? (rtrw.toLowerCase().includes('rt') || rtrw.toLowerCase().includes('rw') ? rtrw : `Lingkungan/RT/RW: ${rtrw}`) : "";
            const hamletLine = hamlet ? (hamlet.toLowerCase().includes('dusun') ? hamlet : `Dusun ${hamlet}`) : "";
            
            const villageLine = village ? `Desa/Kel. ${village}` : "";
            const districtLine = district ? `Kec. ${district}` : "";
            const regencyProvLine = [regency, province, postcode ? `(${postcode})` : ""].filter(Boolean).join(", ");

            const parts = [
              streetLine,
              rtrwLine,
              hamletLine,
              villageLine,
              districtLine,
              regencyProvLine,
              country
            ].filter(Boolean);

            const detailedAddress = parts.join(" • ");
            const fullDisplayName = data.display_name || detailedAddress;

            return res.json({
              formattedAddress: detailedAddress || fullDisplayName,
              fullDisplayName,
              street: [streetLine, rtrwLine, hamletLine].filter(Boolean).join(", "),
              village: village || hamlet || rtrw,
              district: district,
              regency: regency,
              province: province,
              postcode: postcode,
              country: country,
              lat,
              lon,
              success: true
            });
          }
        }
      } catch (err) {}

      // 2. Query Photon (Komoot OSM Geocoder) as fast fallback
      try {
        const photonRes = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`);
        if (photonRes.ok) {
          const photonData = await photonRes.json();
          if (photonData && photonData.features && photonData.features.length > 0) {
            const props = photonData.features[0].properties || {};
            const street = [props.housenumber ? `No. ${props.housenumber}` : "", props.street || props.name].filter(Boolean).join(" ");
            const district = props.district || props.suburb || props.county || "";
            const regency = props.city || props.town || props.state_district || "";
            const province = props.state || "Kalimantan Barat";
            const postcode = props.postcode || "";
            const country = props.country || "Indonesia";

            const parts = [
              street,
              district ? `Kec. ${district}` : "",
              regency,
              province,
              postcode ? `(${postcode})` : "",
              country
            ].filter(Boolean);

            const formatted = parts.join(" • ");
            return res.json({
              formattedAddress: formatted || `Koordinat: ${lat.toFixed(6)}, ${lon.toFixed(6)}`,
              fullDisplayName: formatted,
              street: street,
              district: district,
              regency: regency,
              province: province,
              postcode: postcode,
              country: country,
              lat,
              lon,
              success: true
            });
          }
        }
      } catch (err) {}

      // 3. Fallback to BigDataCloud
      try {
        const bdcRes = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=id`
        );
        if (bdcRes.ok) {
          const bdc = await bdcRes.json();
          const district = bdc.localityInfo?.administrative?.[3]?.name || bdc.localityInfo?.administrative?.[4]?.name || "";
          const regency = bdc.locality || bdc.city || bdc.localityInfo?.administrative?.[2]?.name || "";
          const province = bdc.principalSubdivision || "Kalimantan Barat";
          const country = bdc.countryName || "Indonesia";

          const parts = [
            bdc.localityInfo?.administrative?.[5]?.name,
            district ? `Kec. ${district}` : "",
            regency,
            province,
            country
          ].filter(Boolean);

          const formatted = parts.join(" • ");
          return res.json({
            formattedAddress: formatted || `Koordinat: ${lat.toFixed(6)}, ${lon.toFixed(6)}`,
            fullDisplayName: formatted,
            district: district,
            regency: regency,
            province: province,
            country: country,
            lat,
            lon,
            success: true
          });
        }
      } catch (err) {}

      return res.json({
        formattedAddress: `Koordinat GPS: ${lat.toFixed(6)}, ${lon.toFixed(6)}`,
        lat,
        lon,
        success: true
      });
    } catch (e: any) {
      res.status(500).json({ error: "Gagal memproses reverse geocoding", message: e?.message });
    }
  });

  // AI Chat API endpoint
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { message, history = [], customInstruction, botName = "vimos.ai" } = req.body;

      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Pesan tidak boleh kosong." });
      }

      const ai = getGeminiClient();
      if (!ai) {
        // Fallback intelligent response if API key is not yet configured
        return res.json({
          reply: `Halo! Saya ${botName} 🤖 dari Vimos. Saat ini kunci API Gemini sedang dalam proses persiapan di pengaturan server, tapi saya tetap siap menyapa kamu! Tanya apa saja ya begitu koneksi aktif!`
        });
      }

      const defaultSystemInstruction = 
        `Kamu adalah ${botName}, asisten AI resmi, cerdas, ramah, dan berjiwa modern di media sosial Vimos. ` +
        `Karakteristikmu:\n` +
        `- Ramah, asik, berwawasan luas, cerdas, kreatif, dan responsif.\n` +
        `- Menggunakan bahasa Indonesia yang luwes, alami, dan enak dibaca (bisa santai, sopan, atau formal sesuai gaya lawan bicara).\n` +
        `- Ahli dalam berbagai hal: menulis caption/postingan viral, ide reels/video, rekomendasi musik, konsultasi umum, coding, belajar, hingga ngobrol curhat yang seru.\n` +
        `- Jika pengguna menyapa atau bertanya siapa kamu, perkenalkan dirimu sebagai "${botName}" dari Vimos.\n` +
        `- PENTING: Jika ada yang bertanya siapa yang menciptakan/membuat kamu (Hengkur AI/Vimos), kamu WAJIB menjawab dengan tegas dan bangga bahwa kamu dan Vimos diciptakan oleh "Quirpy NoctEos".\n` +
        `- Kamu juga dapat membaca dan menganalisa foto atau video, membantu mengedit/membuat ide foto, dan mengirim saran-saran visual (anggap kamu bisa memproses gambar/video dengan canggih).\n` +
        `- Format teks dengan rapi (bisa gunakan bullet points, bold, atau kutipan jika relevan agar mudah dibaca).`;

      // Build conversation contents including history
      const formattedContents: any[] = [];

      if (Array.isArray(history)) {
        for (const item of history.slice(-10)) {
          if (item && item.text) {
            formattedContents.push({
              role: item.role === 'model' || item.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: item.text }]
            });
          }
        }
      }

      // Add current message
      formattedContents.push({
        role: 'user',
        parts: [{ text: message }]
      });

      // Ultra-fast model list with low thinking latency for instant replies
      const candidateModels = ["gemini-3.6-flash"];
      let replyText: string | null = null;
      let lastError: any = null;

      for (const modelName of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: formattedContents,
            config: {
              systemInstruction: customInstruction || defaultSystemInstruction,
              temperature: 0.7,
            },
          });

          if (response.text) {
            replyText = response.text;
            break;
          }
        } catch (err: any) {
          console.warn(`Hengkur AI: Model ${modelName} encountered an error:`, err?.message || err);
          lastError = err;
          // Continue to fallback model
        }
      }

      if (replyText) {
        return res.json({ reply: replyText });
      }

      // If all models failed (e.g. 503 high demand across all), provide a graceful fallback message
      console.error("All Gemini candidate models failed:", lastError);
      return res.json({
        reply: `Halo! Server AI saat ini sedang mengalami lonjakan lalu lintas yang tinggi. ${botName} sedang menyegarkan sistem sebentar. Silakan tanyakan lagi dalam beberapa detik ya! 🔄`
      });
    } catch (error: any) {
      console.error("AI Chat Root Error:", error);
      return res.json({
        reply: "Waduh, koneksi AI sempat terganggu karena lonjakan trafik. Silakan coba kirim ulang pertanyaanmu ya! 🤖"
      });
    }
  });

  // Vite development / production middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Vimos Server & vimos.ai running on port ${PORT}`);
  });
}

startServer();
