import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TMAP_API_KEY = process.env.TMAP_API_KEY;

async function searchTmap(query: string) {
  if (!TMAP_API_KEY) return null;

  try {
    const params = new URLSearchParams({
      version: "1",
      searchKeyword: query,
      searchType: "all",
      page: "1",
      count: "1",
      resCoordType: "WGS84GEO",
      reqCoordType: "WGS84GEO",
    });

    const response = await fetch(`https://apis.openapi.sk.com/tmap/pois?${params.toString()}`, {
      headers: { Accept: "application/json", appKey: TMAP_API_KEY },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const rawPois = data?.searchPoiInfo?.pois?.poi;
    if (!rawPois) return null;

    const poi = Array.isArray(rawPois) ? rawPois[0] : rawPois;
    const lat = Number(poi.frontLat || poi.noorLat);
    const lng = Number(poi.frontLon || poi.noorLon);
    if (!lat || !lng) return null;

    return { name: poi.name || query, lat, lng };
  } catch (error) {
    console.log("[geocode] TMAP 검색 오류:", error);
    return null;
  }
}

async function searchNominatim(query: string) {
  try {
    const params = new URLSearchParams();
    params.set("q", query);
    params.set("format", "jsonv2");
    params.set("countrycodes", "kr");
    params.set("accept-language", "ko");
    params.set("limit", "1");

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { "User-Agent": "DRIVE-AI-Prototype/1.0", Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const item = data[0];
    const displayName = item.display_name || query;
    const name = item.name || displayName.split(",")[0].trim();

    return { name, lat: Number(item.lat), lng: Number(item.lon) };
  } catch (error) {
    console.log("[geocode] Nominatim 검색 오류:", error);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const query = (body?.query || "").trim();

    if (!query) {
      return NextResponse.json({ ok: false, error: "출발지를 입력해주세요." }, { status: 400 });
    }

    const result = (await searchTmap(query)) || (await searchNominatim(query));

    if (!result) {
      return NextResponse.json(
        { ok: false, error: "해당 위치를 지도에서 찾지 못했습니다. 다른 이름으로 다시 입력해주세요." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error("[geocode] 오류:", error);
    return NextResponse.json({ ok: false, error: "출발지 검색 중 오류가 발생했습니다." }, { status: 500 });
  }
}
