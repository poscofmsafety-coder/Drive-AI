import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ==================================================
   타입
================================================== */

type UserRequest = {
  query: string;
  latitude?: number | null;
  longitude?: number | null;
  start?: string;
  durationHours?: number; // 가능 시간 (숫자, 시간 단위)
  routeType?: string; // "왕복" | "편도"
};

type Place = {
  id: string;
  place_name: string;
  category_name: string;
  phone: string;
  address_name: string;
  road_address_name: string;
  x: string; // 경도
  y: string; // 위도
  place_url: string;
};

type AIRecommendation = {
  searchQuery: string;
  altSearchQuery: string;
  title: string;
  reason: string;
  score: number;
  highlights: string[];
  musicKeywords: string[];
};

type AIResult = {
  summary: string;
  musicMood: string;
  recommendations: AIRecommendation[];
};

const TMAP_API_KEY = process.env.TMAP_API_KEY;

type BlogPost = {
  title: string;
  link: string;
  description: string;
  regionKeywords: string[];
};

/* ==================================================
   유틸
================================================== */

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ==================================================
   인기 드라이브 코스 블로그 큐레이션 (실제 검색으로 확인한 글들, 수동 관리)
   네이버 검색 API 없이도 "실제로 많이 언급되는 코스" 참고자료를 제공하기 위한 정적 데이터입니다.
   새로운 글을 추가하려면 아래 배열에 항목을 추가하세요.
================================================== */

const CURATED_DRIVE_BLOGS: BlogPost[] = [
  {
    title: "한국의 아름다운 드라이브 코스 8곳 - Go Guides",
    link: "https://kr.hotels.com/go/south-korea/road-trips-korea",
    description:
      "강릉 헌화로, 서울 북악스카이웨이, 서해 백수해안도로 등 전국 대표 드라이브 도로를 소개하는 종합 가이드.",
    regionKeywords: ["강릉", "동해", "강원", "서울", "북악", "서해", "영광"],
  },
  {
    title: "시원한 바람 맞으며 떠나는 국내 해변 드라이브 코스 - 미쉐린 블로그",
    link: "https://www.michelin.co.kr/blog/articles/summer-beach-drives-vehicle-check",
    description:
      "삼척 새천년해안도로, 고흥 거금 해안경관길, 태안 꽃지해수욕장 등 해안 드라이브 코스와 주변 명소 정리.",
    regionKeywords: ["삼척", "동해", "강원", "고흥", "전남", "태안", "충남", "서해"],
  },
  {
    title: "남해안 추천 드라이브 코스 - Triple",
    link: "https://triple.guide/articles/1725b568-2403-4e30-91e1-130a13bc35be",
    description:
      "통영, 거제, 남해를 잇는 남해안 대표 해안 도로와 가천 다랭이마을 등 주요 뷰포인트 소개.",
    regionKeywords: ["남해", "통영", "거제", "경남", "다랭이"],
  },
  {
    title: "남해 드라이브 코스 완벽 가이드",
    link: "https://love.kkokkori.com/entry/%EB%82%A8%ED%95%B4-%EB%93%9C%EB%9D%BC%EC%9D%B4%EB%B8%8C-%EC%BD%94%EC%8A%A4-%EC%99%84%EB%B2%BD-%EA%B0%80%EC%9D%B4%EB%93%9C",
    description:
      "남해대교, 해안도로, 일몰 명소, 드라이브 맛집까지 남해 드라이브 코스를 테마별로 정리한 가이드.",
    regionKeywords: ["남해", "경남", "남해대교"],
  },
  {
    title: "차창 밖 빛나는 노을! 서해안 드라이브 코스 BEST 3 - 대한민국 구석구석",
    link: "https://korean.visitkorea.or.kr/detail/rem_detail.do?cotid=dc38b3af-42ad-4bc7-9633-6eb234ffe62d",
    description: "영종도, 새만금방조제, 대부도 등 노을이 아름다운 서해안 드라이브 코스 3선.",
    regionKeywords: ["영종도", "인천", "군산", "새만금", "대부도", "서해", "경기"],
  },
  {
    title: "강원 네이처로드 - 바다 드라이브길 - 대한민국 구석구석",
    link: "https://korean.visitkorea.or.kr/static/coalition/ganwonnr/course06.html",
    description: "강원 동해안을 따라가는 공식 추천 드라이브 코스로 경포대, 촛대바위 등을 경유.",
    regionKeywords: ["강원", "동해", "속초", "강릉", "경포"],
  },
  {
    title: "제주도 드라이브 코스 추천 BEST 8 - 여행톡톡",
    link: "https://v.daum.net/v/4rV6rT3o5f",
    description:
      "신창풍차 해안도로, 애월 해안도로, 도두 무지개 해안도로 등 제주 동서 해안 드라이브 코스 8선.",
    regionKeywords: ["제주", "애월", "신창"],
  },
  {
    title: "드라이브하기 좋은 해안 도로 (제주) - Triple",
    link: "https://triple.guide/articles/d68641b1-b0b6-487c-ae72-d8f570310f79",
    description: "산방산-송악산 해안도로, 광치기-하도 해안도로 등 제주 해안 드라이브 코스 7선.",
    regionKeywords: ["제주", "산방산", "성산", "송악산"],
  },
  {
    title: "서울 근교 드라이브 코스 BEST 7 - KKday",
    link: "https://www.kkday.com/ko/blog/13359/asia-korea-seoul-suburbs-drive-course",
    description: "영종도, 파주 마장호수, 대부도 탄도항 등 서울에서 당일치기로 다녀올 수 있는 드라이브 코스.",
    regionKeywords: ["서울", "경기", "파주", "인천", "마장호수", "대부도"],
  },
  {
    title: "주말에 가기 좋은 드라이브 추천 코스 - Triple",
    link: "https://triple.guide/articles/c984f420-3d87-4cc2-a22a-fb4aba4871eb",
    description: "궁평항, 매향리 방조제, 남한산성 등 경기권 주말 드라이브 코스 정리.",
    regionKeywords: ["경기", "화성", "안산", "궁평항", "남한산성"],
  },
  {
    title: "자동차로 떠나는 국내 드라이브 여행 코스 BEST 10",
    link: "https://allroundtip.com/blog/domestic-drive-course-best10/",
    description:
      "강릉 동해안, 부산 달맞이길, 남해 해안국도, 가평 팔당호, 대관령, 담양 메타세쿼이아길 등 전국 드라이브 명소 종합 정리.",
    regionKeywords: ["부산", "달맞이", "가평", "대관령", "무주", "대구", "팔공산", "담양"],
  },
];

function findRelevantBlogs(text: string, limit = 4): BlogPost[] {
  const scored = CURATED_DRIVE_BLOGS.map((blog) => {
    const score = blog.regionKeywords.reduce(
      (count, keyword) => count + (text.includes(keyword) ? 1 : 0),
      0
    );
    return { blog, score };
  }).filter((item) => item.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((item) => item.blog);
}

function findBlogForPlace(placeName: string, addressName: string): BlogPost | null {
  const text = `${placeName} ${addressName}`;
  const matches = findRelevantBlogs(text, 1);
  return matches[0] || null;
}

async function searchTmapPOI(query: string, count = 5): Promise<Place[]> {
  if (!TMAP_API_KEY) return [];

  try {
    const params = new URLSearchParams({
      version: "1",
      searchKeyword: query,
      searchType: "all",
      page: "1",
      count: String(count),
      resCoordType: "WGS84GEO",
      reqCoordType: "WGS84GEO",
      multiPoint: "N",
    });

    const response = await fetch(
      `https://apis.openapi.sk.com/tmap/pois?${params.toString()}`,
      {
        headers: { Accept: "application/json", appKey: TMAP_API_KEY },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!response.ok) {
      console.log("[recommend] TMAP POI 검색 HTTP 오류:", response.status, query);
      return [];
    }

    const data = await response.json();
    const rawPois = data?.searchPoiInfo?.pois?.poi;
    if (!rawPois) return [];

    const list = Array.isArray(rawPois) ? rawPois : [rawPois];

    return list.map((poi: any) => {
      const address = [
        poi.upperAddrName,
        poi.middleAddrName,
        poi.lowerAddrName,
        poi.firstNo,
      ]
        .filter(Boolean)
        .join(" ");

      return {
        id: `tmap-${poi.id}`,
        place_name: poi.name || query,
        category_name: poi.middleBizName || poi.upperBizName || "장소",
        phone: poi.telNo || "",
        address_name: address,
        road_address_name: address,
        x: poi.frontLon || poi.noorLon,
        y: poi.frontLat || poi.noorLat,
        place_url: `https://www.tmap.co.kr/tmap2/mobile/search.jsp?searchword=${encodeURIComponent(
          poi.name || query
        )}`,
      } as Place;
    });
  } catch (error) {
    console.log("[recommend] TMAP POI 검색 오류:", query, error);
    return [];
  }
}

/* ==================================================
   OpenStreetMap Nominatim 검색 (TMAP 키가 없을 때 대체 경로)
================================================== */

async function searchNominatim(
  query: string,
  extraParams?: Record<string, string>
): Promise<Place[]> {
  try {
    const params = new URLSearchParams();
    params.set("q", query);
    params.set("format", "jsonv2");
    params.set("addressdetails", "1");
    params.set("countrycodes", "kr");
    params.set("accept-language", "ko");
    params.set("limit", "5");

    if (extraParams) {
      for (const [key, value] of Object.entries(extraParams)) {
        params.set(key, value);
      }
    }

    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "DRIVE-AI-Prototype/1.0",
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.log("[recommend] Nominatim HTTP 오류:", response.status, query);
      return [];
    }

    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return data.map((item: any) => {
      const osmType = item.osm_type || "node";
      const osmId = String(item.osm_id);
      const displayName = item.display_name || "";
      const placeName = item.name || displayName.split(",")[0].trim() || query;

      return {
        id: `osm-${osmType}-${osmId}`,
        place_name: placeName,
        category_name: item.type || item.category || "장소",
        phone: "",
        address_name: displayName,
        road_address_name: displayName,
        x: String(item.lon),
        y: String(item.lat),
        place_url: `https://www.openstreetmap.org/${osmType}/${osmId}`,
      } as Place;
    });
  } catch (error) {
    console.log("[recommend] Nominatim 검색 오류:", query, error);
    return [];
  }
}

/* ==================================================
   장소 검색 (TMAP 우선, 없으면 Nominatim)
================================================== */

async function searchPlaces(query: string): Promise<Place[]> {
  if (TMAP_API_KEY) {
    const tmapResults = await searchTmapPOI(query);
    if (tmapResults.length > 0) return tmapResults;
  }
  return searchNominatim(query);
}

/* ==================================================
   목적지 찾기: 구체적 장소 검색 -> 실패 시 대체 후보로 재시도
================================================== */

async function findDestination(
  recommendation: AIRecommendation,
  usedPlaceIds: Set<string>
): Promise<Place | null> {
  const primaryPlaces = await searchPlaces(recommendation.searchQuery);
  const primaryMatch = primaryPlaces.find((p) => !usedPlaceIds.has(p.id));
  if (primaryMatch) return primaryMatch;

  if (!TMAP_API_KEY) await sleep(1100); // Nominatim 사용 정책(초당 1건)

  const altPlaces = await searchPlaces(recommendation.altSearchQuery);
  const altMatch = altPlaces.find((p) => !usedPlaceIds.has(p.id));
  return altMatch || null;
}

/* ==================================================
   목적지 주변 카페 / 맛집 검색
================================================== */

async function searchNearby(lat: number, lon: number, keyword: string): Promise<Place[]> {
  if (TMAP_API_KEY) {
    return searchTmapPOI(keyword, 3);
  }

  const delta = 0.03;
  const viewbox = [lon - delta, lat + delta, lon + delta, lat - delta].join(",");
  return searchNominatim(keyword, { viewbox, bounded: "1", limit: "3" });
}

/* ==================================================
   실제 도로 기준 거리/시간/경로 (TMAP 우선, 없으면 OSRM, 그래도 없으면 직선거리)
================================================== */

async function getTmapRoute(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): Promise<{ distanceKm: number; durationMin: number; coordinates: [number, number][] } | null> {
  if (!TMAP_API_KEY) return null;

  try {
    const response = await fetch("https://apis.openapi.sk.com/tmap/routes?version=1", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        appKey: TMAP_API_KEY,
      },
      body: JSON.stringify({
        startX: lon1,
        startY: lat1,
        endX: lon2,
        endY: lat2,
        reqCoordType: "WGS84GEO",
        resCoordType: "WGS84GEO",
        searchOption: "0",
        sort: "index",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      console.log("[recommend] TMAP 경로안내 HTTP 오류:", response.status, bodyText.slice(0, 300));
      return null;
    }

    const data = await response.json();
    const features = data?.features;
    if (!Array.isArray(features) || features.length === 0) {
      console.log("[recommend] TMAP 경로안내: features 없음");
      return null;
    }

    const summary = features[0]?.properties;
    if (!summary?.totalDistance) return null;

    const coordinates: [number, number][] = [];
    for (const feature of features) {
      if (feature.geometry?.type === "LineString") {
        for (const [lon, lat] of feature.geometry.coordinates) {
          coordinates.push([lat, lon]);
        }
      }
    }

    console.log(
      `[recommend] TMAP 경로안내 성공: ${(summary.totalDistance / 1000).toFixed(1)}km, 좌표 ${coordinates.length}개`
    );

    return {
      distanceKm: Math.round(summary.totalDistance / 100) / 10,
      durationMin: Math.round(summary.totalTime / 60),
      coordinates,
    };
  } catch (error) {
    console.log("[recommend] TMAP 경로안내 오류 (OSRM으로 대체):", error);
    return null;
  }
}

async function getOsrmRoute(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): Promise<{ distanceKm: number; durationMin: number; coordinates: [number, number][] } | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`;

    const response = await fetch(url, {
      headers: { "User-Agent": "DRIVE-AI-Prototype/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data?.code !== "Ok") return null;

    const route = data?.routes?.[0];
    if (!route) return null;

    const coordinates: [number, number][] = (route.geometry?.coordinates || []).map(
      ([lon, lat]: [number, number]) => [lat, lon]
    );

    return {
      distanceKm: Math.round(route.distance / 100) / 10,
      durationMin: Math.round(route.duration / 60),
      coordinates,
    };
  } catch (error) {
    console.log("[recommend] OSRM 경로 조회 실패 (직선거리로 대체):", error);
    return null;
  }
}

async function getDrivingRoute(lat1: number, lon1: number, lat2: number, lon2: number) {
  const tmapRoute = await getTmapRoute(lat1, lon1, lat2, lon2);
  if (tmapRoute) return tmapRoute;

  const osrmRoute = await getOsrmRoute(lat1, lon1, lat2, lon2);
  if (osrmRoute) return osrmRoute;

  return null;
}

/* ==================================================
   현재 좌표 -> 지역명 (AI 프롬프트용 참고 정보)
================================================== */

async function getCurrentRegion(latitude?: number | null, longitude?: number | null) {
  if (typeof latitude !== "number" || typeof longitude !== "number") return "대한민국";

  try {
    const params = new URLSearchParams();
    params.set("lat", String(latitude));
    params.set("lon", String(longitude));
    params.set("format", "jsonv2");
    params.set("accept-language", "ko");

    const url = `https://nominatim.openstreetmap.org/reverse?${params.toString()}`;

    const response = await fetch(url, {
      headers: { "User-Agent": "DRIVE-AI-Prototype/1.0", Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return "대한민국";

    const data = await response.json();
    const address = data.address || {};

    const region = [address.province, address.city, address.county, address.borough, address.town]
      .filter(Boolean)
      .slice(0, 2)
      .join(" ");

    return region || "대한민국";
  } catch (error) {
    console.log("[recommend] 현재 지역 확인 실패:", error);
    return "대한민국";
  }
}

/* ==================================================
   AI 결과 JSON 형태 검증
================================================== */

function validateAIResult(raw: any): AIResult {
  if (!raw || typeof raw !== "object") {
    throw new Error("AI 응답 형식이 올바르지 않습니다.");
  }

  if (!Array.isArray(raw.recommendations) || raw.recommendations.length < 1) {
    throw new Error("AI가 추천 목록을 만들지 못했습니다.");
  }

  const recommendations: AIRecommendation[] = raw.recommendations
    .slice(0, 5)
    .map((item: any, index: number) => {
      if (!item || typeof item.searchQuery !== "string") {
        throw new Error(`추천 ${index + 1}번 항목에 검색어(searchQuery)가 없습니다.`);
      }

      return {
        searchQuery: item.searchQuery,
        altSearchQuery:
          typeof item.altSearchQuery === "string" && item.altSearchQuery.trim()
            ? item.altSearchQuery
            : item.searchQuery,
        title: typeof item.title === "string" ? item.title : "추천 코스",
        reason: typeof item.reason === "string" ? item.reason : "",
        score:
          typeof item.score === "number" ? Math.min(100, Math.max(0, Math.round(item.score))) : 80,
        highlights: Array.isArray(item.highlights) ? item.highlights.slice(0, 3).map(String) : [],
        musicKeywords: Array.isArray(item.musicKeywords)
          ? item.musicKeywords.slice(0, 3).map(String)
          : [],
      };
    });

  return {
    summary: typeof raw.summary === "string" ? raw.summary : "추천 코스를 준비했습니다.",
    musicMood: typeof raw.musicMood === "string" ? raw.musicMood : "드라이브 믹스",
    recommendations,
  };
}

/* ==================================================
   메인 POST
================================================== */

export async function POST(request: Request) {
  try {
    console.log("========================================");
    console.log(
      "[recommend] 요청 시작",
      TMAP_API_KEY ? "(TMAP 키 사용 중 - 빠른 경로)" : "(TMAP 키 없음 - Nominatim 경로, 느릴 수 있음)"
    );

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: "OpenAI API 키가 없습니다. .env.local의 OPENAI_API_KEY를 확인하고 서버를 재시작하세요.",
        },
        { status: 500 }
      );
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const openai = new OpenAI({ apiKey, timeout: 45000 });

    let body: UserRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "브라우저 요청 데이터를 읽지 못했습니다." },
        { status: 400 }
      );
    }

    const query = body.query?.trim();
    if (!query) {
      return NextResponse.json(
        { ok: false, error: "어디로 가고 싶은지 입력해주세요." },
        { status: 400 }
      );
    }

    const durationHours =
      typeof body.durationHours === "number" && body.durationHours > 0 ? body.durationHours : 4;
    const routeType = body.routeType === "편도" ? "편도" : "왕복";

    console.log("[recommend] 사용자 요청:", query, "| 가능시간:", durationHours, "시간 |", routeType);

    const currentRegion = await getCurrentRegion(body.latitude, body.longitude);

    /* ------------------------------
       0) 큐레이션된 인기 드라이브 블로그에서 관련 글 매칭 (AI 참고자료, API 호출 없음)
    ------------------------------ */

    let blogContext = "";
    const matchedBlogs = findRelevantBlogs(`${currentRegion} ${query}`, 4);

    if (matchedBlogs.length > 0) {
      blogContext = matchedBlogs
        .map((b, i) => `${i + 1}. [${b.title}] ${b.description}`)
        .join("\n");
      console.log(`[recommend] 큐레이션 블로그 매칭 ${matchedBlogs.length}건`);
    }

    /* ------------------------------
       1) OpenAI 추천 후보 생성 (5개 요청 -> 실제 확인되는 순서로 3개 채택)
    ------------------------------ */

    let completion;
    try {
      completion = await openai.chat.completions.create({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "당신은 대한민국의 AI 드라이브 코스 추천 서비스 DRIVE AI의 추천 엔진입니다. " +
              "반드시 순수 JSON 객체 하나만 출력하세요. 코드블록(```)이나 설명 문장은 절대 포함하지 마세요.",
          },
          {
            role: "user",
            content: `
사용자가 원하는 드라이브를 분석하여, 실제 지도에서 검색할 목적지 후보를 5개 만드세요.
(이 중 지도에서 실제로 확인되는 것부터 최대 3개를 사용자에게 보여줄 예정이므로, 5개 모두 서로 다른 실제 장소여야 합니다.)

[현재 위치]
현재 지역: ${currentRegion}
위도: ${body.latitude ?? "알 수 없음"}
경도: ${body.longitude ?? "알 수 없음"}

[사용자 요청]
${query}

[드라이브 조건]
가능 시간: 총 ${durationHours}시간 (${routeType})
${routeType === "왕복" ? `→ 이동+관광을 포함해 왕복으로 총 ${durationHours}시간을 쓸 수 있음. 편도 이동시간은 대략 ${Math.max(15, Math.round((durationHours * 60) / 2.5))}분 전후를 목표로 할 것.` : `→ 편도로 최대 ${durationHours}시간(${durationHours * 60}분)까지 이동 가능. 목표 편도 이동시간은 대략 ${Math.max(15, Math.round(durationHours * 60 * 0.7))}분 전후로 할 것.`}
${
  blogContext
    ? `\n[참고: 실제로 많이 언급되는 인기 드라이브 코스 블로그 정보]\n${blogContext}\n\n위 블로그들에서 실제로 언급되는 구체적인 명소/코스가 있다면 최대한 우선적으로 활용할 것 (실제로 검증된 인기 드라이브 코스라는 뜻).\n`
    : ""
}
규칙:
- 대한민국 실제 장소를 대상으로 함 (허구의 상호명 생성 금지)
- 반드시 실제로 존재하고 지도 앱(카카오맵/네이버지도/티맵)에서 검색되는 "구체적인 명소/랜드마크"만 추천할 것.
  "OO 일출 감상 코스" 같은 추상적/서술적 이름은 searchQuery로 쓰지 말 것 —
  실제 공식 명칭(예: "간절곶", "임진각 평화누리공원", "구룡포 일본인가옥거리", "남해 독일마을", "정동진 해돋이공원")을 사용할 것
- searchQuery와 altSearchQuery는 둘 다 "실제 명소명 + 지역명" 형태의 서로 다른 구체적 장소여야 함
  (altSearchQuery는 searchQuery가 지도에서 안 잡힐 경우의 대체 후보이며, 반드시 또 다른 구체적 명소명이어야 함 —
  넓은 행정구역명이나 추상적 설명 금지)
- 5개 후보는 서로 완전히 다른 장소여야 함 (겹치지 않게)
- 위에서 계산된 "목표 편도 이동시간"에 최대한 맞는 장소를 우선할 것. 주어진 시간을 다 못 쓰고
  너무 가까운 곳(예: 목표의 절반 이하)만 추천하지 말고, 시간을 알차게 쓸 수 있는 곳을 적극적으로 고려할 것.
  단, 목표 시간을 크게 초과하는 곳은 피할 것
- 특정 장소가 언급되면 해당 장소를 우선 반영

다음 JSON 형식으로만 응답하세요:
{
  "summary": "전체 추천에 대한 한두 문장 요약",
  "musicMood": "이 드라이브에 어울리는 음악 무드 한 단어~짧은 구",
  "recommendations": [
    {
      "searchQuery": "실제 명소명 + 지역명",
      "altSearchQuery": "같은 지역의 다른 실제 명소명 (대체 후보)",
      "title": "코스 제목",
      "reason": "이 코스를 추천하는 이유 (2~3문장)",
      "score": 0에서 100 사이 숫자,
      "highlights": ["하이라이트1", "하이라이트2", "하이라이트3"],
      "musicKeywords": ["음악키워드1", "음악키워드2", "음악키워드3"]
    }
  ]
}
`,
          },
        ],
      });
    } catch (error: any) {
      console.error("[recommend] OpenAI 호출 실패:", error);

      let message = "OpenAI 호출 중 오류가 발생했습니다.";
      if (error?.status === 401) {
        message = "OpenAI API 키 인증에 실패했습니다. 키가 올바른지 확인해주세요.";
      } else if (error?.status === 429) {
        message = "OpenAI API 사용 한도 또는 결제 크레딧을 확인해주세요.";
      } else if (error?.status === 404) {
        message = `"${model}" 모델을 사용할 수 없습니다. OPENAI_MODEL 값을 계정에서 사용 가능한 모델명으로 바꿔주세요.`;
      } else if (error?.message) {
        message = error.message;
      }

      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }

    const outputText = completion.choices?.[0]?.message?.content;
    if (!outputText || !outputText.trim()) {
      return NextResponse.json(
        { ok: false, error: "OpenAI는 연결됐지만 추천 결과가 비어 있습니다." },
        { status: 500 }
      );
    }

    let aiResult: AIResult;
    try {
      aiResult = validateAIResult(JSON.parse(outputText));
    } catch (error) {
      console.error("[recommend] OpenAI 결과 파싱/검증 실패:", error);
      return NextResponse.json(
        { ok: false, error: "OpenAI 추천 결과를 처리하지 못했습니다. 잠시 후 다시 시도해주세요." },
        { status: 500 }
      );
    }

    /* ------------------------------
       2) 실제 장소 검증 + 주변 카페/맛집 + 실제 경로. 3개가 채워지면 중단.
    ------------------------------ */

    const usedPlaceIds = new Set<string>();

    async function buildCourse(recommendation: AIRecommendation) {
      const destination = await findDestination(recommendation, usedPlaceIds);
      if (!TMAP_API_KEY) await sleep(1100);

      if (!destination) {
        console.log("[recommend] 검색 결과 없음 (대체 후보도 실패):", recommendation.searchQuery);
        return null;
      }

      usedPlaceIds.add(destination.id);

      const destLat = Number(destination.y);
      const destLng = Number(destination.x);

      const nearbyCafes = await searchNearby(destLat, destLng, "카페");
      if (!TMAP_API_KEY) await sleep(1100);
      const nearbyRestaurants = await searchNearby(destLat, destLng, "맛집 식당");
      if (!TMAP_API_KEY) await sleep(1100);

      const blogPost = findBlogForPlace(destination.place_name, destination.address_name);

      let estimatedDistanceKm: number | null = null;
      let estimatedMinutes: number | null = null;
      let routeCoordinates: [number, number][] | undefined;

      if (typeof body.latitude === "number" && typeof body.longitude === "number") {
        const drivingRoute = await getDrivingRoute(body.latitude, body.longitude, destLat, destLng);

        if (drivingRoute) {
          estimatedDistanceKm = drivingRoute.distanceKm;
          estimatedMinutes = drivingRoute.durationMin;
          routeCoordinates = drivingRoute.coordinates;
        } else {
          const straightDistance = haversineKm(body.latitude, body.longitude, destLat, destLng);
          estimatedDistanceKm = Math.round(straightDistance * 1.25);
          estimatedMinutes = Math.max(10, Math.round((estimatedDistanceKm / 55) * 60));
        }
      }

      return {
        title: recommendation.title,
        reason: recommendation.reason,
        score: recommendation.score,
        highlights: recommendation.highlights,
        musicKeywords: recommendation.musicKeywords,
        destination,
        nearbyCafes: nearbyCafes.map((p) => p.place_name),
        nearbyRestaurants: nearbyRestaurants.map((p) => p.place_name),
        estimatedDistanceKm,
        estimatedMinutes,
        routeType,
        routeCoordinates,
        blogTitle: blogPost?.title || null,
        blogUrl: blogPost?.link || null,
        blogSummary: blogPost?.description || null,
      };
    }

    let courses: any[] = [];

    if (TMAP_API_KEY) {
      // TMAP은 Nominatim 같은 속도 제한이 없어 5개 후보를 병렬로 처리하고 앞에서부터 3개를 채택합니다.
      const built = await Promise.all(aiResult.recommendations.map((rec) => buildCourse(rec)));
      courses = built.filter(Boolean).slice(0, 3);
    } else {
      for (const rec of aiResult.recommendations) {
        if (courses.length >= 3) break;
        const course = await buildCourse(rec);
        if (course) courses.push(course);
      }
    }

    courses = courses.map((c, i) => ({ ...c, rank: i + 1 }));

    if (courses.length === 0) {
      return NextResponse.json({
        ok: true,
        intent: { summary: aiResult.summary, musicMood: aiResult.musicMood },
        aiComment: `${aiResult.summary}\n\nAI가 제안한 명소를 지도에서 확인하지 못했습니다. 조금 더 구체적인 지명(예: "간절곶", "정동진")으로 다시 시도해보시거나, 다시 한번 눌러주세요.`,
        courses: [],
      });
    }

    console.log("[recommend] 추천 코스 생성 완료:", courses.length, "/ 3");

    return NextResponse.json({
      ok: true,
      intent: { summary: aiResult.summary, musicMood: aiResult.musicMood },
      aiComment: aiResult.summary,
      courses,
      notice: TMAP_API_KEY
        ? "거리·시간·경로는 TMAP 실제 도로 데이터 기준입니다."
        : "거리·시간은 실제 도로 경로(OSRM) 기준입니다. TMAP API 키를 등록하면 더 정확하고 빨라집니다.",
    });
  } catch (error: any) {
    console.error("[recommend] 예상치 못한 서버 오류:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "AI 추천 중 서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
