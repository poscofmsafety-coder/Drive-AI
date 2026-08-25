"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import {
  Navigation,
  MapPin,
  Search,
  Mic,
  Clock,
  Route,
  Coffee,
  Utensils,
  ExternalLink,
  Play,
  Dice5,
  Locate,
} from "lucide-react";

type Place = {
  id: string;
  place_name: string;
  category_name: string;
  phone: string;
  address_name: string;
  road_address_name: string;
  x: string;
  y: string;
  place_url: string;
};

type Course = {
  rank: number;
  title: string;
  reason: string;
  score: number;
  highlights: string[];
  musicKeywords: string[];
  destination: Place;
  nearbyCafes?: string[];
  nearbyRestaurants?: string[];
  estimatedDistanceKm: number | null;
  estimatedMinutes: number | null;
  routeType?: string;
  routeCoordinates?: [number, number][];
  blogTitle?: string | null;
  blogUrl?: string | null;
  blogSummary?: string | null;
};

const QUICK_QUERIES = [
  "바다 보러 가고 싶어",
  "야경 좋은 곳 가자",
  "숲길 힐링 드라이브",
  "맛있는 거 먹으러 가자",
];

export default function Home() {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const markers = useRef<any[]>([]);
  const routeLine = useRef<any>(null);

  const [query, setQuery] = useState("");
  const [start, setStart] = useState("현재 위치");
  const [geocodingStart, setGeocodingStart] = useState(false);
  const [durationHours, setDurationHours] = useState("4");
  const [routeType, setRouteType] = useState<"왕복" | "편도">("왕복");

  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [isCurrentLocation, setIsCurrentLocation] = useState(true);

  const [loading, setLoading] = useState(false);
  const [aiComment, setAiComment] = useState("원하는 드라이브를 말해주세요.");
  const [notice, setNotice] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [musicMood, setMusicMood] = useState("AI 추천 준비 중");

  useEffect(() => {
    let cancelled = false;

    async function createMap() {
      if (!mapElement.current || mapInstance.current) return;

      const L = (await import("leaflet")).default;
      if (cancelled) return;

      leafletRef.current = L;

      const map = L.map(mapElement.current, {
        center: [36.019, 129.3435],
        zoom: 11,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      mapInstance.current = map;
      setTimeout(() => map.invalidateSize(), 300);
    }

    createMap();

    return () => {
      cancelled = true;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  function placeStartMarker(lat: number, lng: number, zoom = 14) {
    const map = mapInstance.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    map.setView([lat, lng], zoom);
    const marker = L.marker([lat, lng]);
    marker.addTo(map).bindPopup("<b>출발지</b>").openPopup();
    markers.current.push(marker);
  }

  function getMyLocation() {
    if (!navigator.geolocation) {
      alert("현재 위치를 지원하지 않는 브라우저입니다.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        setLatitude(lat);
        setLongitude(lng);
        setStart("현재 위치");
        setIsCurrentLocation(true);
        placeStartMarker(lat, lng);
      },
      () => alert("브라우저에서 위치 권한을 허용해주세요."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  useEffect(() => {
    const timer = setTimeout(() => getMyLocation(), 800);
    return () => clearTimeout(timer);
  }, []);

  async function confirmCustomStart() {
    const trimmed = start.trim();
    if (!trimmed || trimmed === "현재 위치") {
      getMyLocation();
      return;
    }

    setGeocodingStart(true);
    try {
      const response = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        alert(data?.error || "출발지를 찾지 못했습니다.");
        return;
      }

      setLatitude(data.lat);
      setLongitude(data.lng);
      setStart(data.name);
      setIsCurrentLocation(false);
      placeStartMarker(data.lat, data.lng);
    } catch (error) {
      console.error("[page] 출발지 지오코딩 오류:", error);
      alert("출발지 검색 중 오류가 발생했습니다.");
    } finally {
      setGeocodingStart(false);
    }
  }

  async function recommend(customQuery?: string) {
    const finalQuery = (customQuery ?? query).trim();

    if (!finalQuery) {
      alert("예: 바다 보러 가고 싶어 라고 입력해주세요.");
      return;
    }

    if (latitude === null || longitude === null) {
      alert("출발지가 아직 설정되지 않았습니다. 현재 위치를 허용하거나 출발지를 입력 후 확인해주세요.");
      return;
    }

    setLoading(true);
    setAiComment("AI가 요청을 분석하고 실제 장소를 찾고 있습니다...");
    setCourses([]);
    setSelectedCourse(null);

    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: finalQuery,
          start,
          durationHours: Number(durationHours) || 4,
          routeType,
          latitude,
          longitude,
        }),
      });

      let data: any = null;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error("[page] 응답 JSON 파싱 실패:", parseError);
        throw new Error(`서버 응답을 읽지 못했습니다. (status ${response.status})`);
      }

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || `추천 실패 (status ${response.status})`);
      }

      setAiComment(data.aiComment || data.intent?.summary || "추천 코스를 만들었습니다.");
      setMusicMood(data.intent?.musicMood || "드라이브 믹스");
      setCourses(data.courses || []);
      setNotice(data.notice || "");
    } catch (error) {
      console.error("[page] recommend() 오류:", error);
      setAiComment(error instanceof Error ? error.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function clearMapObjects() {
    const map = mapInstance.current;
    if (!map) return;

    markers.current.forEach((marker) => map.removeLayer(marker));
    markers.current = [];

    if (routeLine.current) {
      map.removeLayer(routeLine.current);
      routeLine.current = null;
    }
  }

  useEffect(() => {
    const map = mapInstance.current;
    const L = leafletRef.current;
    if (!map || !L || !courses.length) return;

    clearMapObjects();

    const bounds: any[] = [];

    if (latitude !== null && longitude !== null) {
      const currentMarker = L.marker([latitude, longitude]);
      currentMarker.addTo(map).bindPopup("<b>출발지</b>");
      markers.current.push(currentMarker);
      bounds.push([latitude, longitude]);
    }

    courses.forEach((course) => {
      const lat = Number(course.destination.y);
      const lng = Number(course.destination.x);

      const marker = L.marker([lat, lng]);
      marker.addTo(map).bindPopup(
        `<div style="min-width:180px;line-height:1.6;">
          <b>추천 ${course.rank}</b><br/>
          ${course.destination.place_name}<br/>
          <span style="color:#1d4ed8;font-weight:800;">${course.score}점</span>
        </div>`
      );
      marker.on("click", () => selectCourse(course));
      markers.current.push(marker);
      bounds.push([lat, lng]);
    });

    if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [80, 80] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses, latitude, longitude]);

  function selectCourse(course: Course) {
    setSelectedCourse(course);

    const map = mapInstance.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    clearMapObjects();

    const points: any[] = [];

    if (latitude !== null && longitude !== null) {
      const currentMarker = L.marker([latitude, longitude]);
      currentMarker.addTo(map).bindPopup("<b>출발지</b>");
      markers.current.push(currentMarker);
      points.push([latitude, longitude]);
    }

    const destLat = Number(course.destination.y);
    const destLng = Number(course.destination.x);

    const destinationMarker = L.marker([destLat, destLng]);
    destinationMarker
      .addTo(map)
      .bindPopup(`<b>${course.destination.place_name}</b>`)
      .openPopup();
    markers.current.push(destinationMarker);
    points.push([destLat, destLng]);

    if (course.routeCoordinates && course.routeCoordinates.length > 1) {
      const routePoints = course.routeCoordinates;
      routeLine.current = L.polyline(routePoints, {
        weight: 6,
        opacity: 0.9,
        color: "#1d4ed8",
      }).addTo(map);
      map.fitBounds(L.latLngBounds(routePoints), { padding: [80, 80] });
    } else if (points.length >= 2) {
      routeLine.current = L.polyline(points, {
        weight: 4,
        opacity: 0.6,
        color: "#94a3b8",
        dashArray: "10 10",
      })
        .addTo(map)
        .bindPopup("실제 도로 경로를 가져오지 못해 직선으로 표시 중입니다.");
      map.fitBounds(L.latLngBounds(points), { padding: [80, 80] });
    } else {
      map.setView([destLat, destLng], 13);
    }
  }

  function startVoice() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Chrome 또는 Edge에서 실행해주세요.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    setIsListening(true);
    recognition.start();

    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setQuery(text);
      recommend(text);
    };

    recognition.onerror = () => {
      setIsListening(false);
      alert("음성을 인식하지 못했습니다.");
    };

    recognition.onend = () => setIsListening(false);
  }

  function tryAppThenWebFallback(appUrl: string, webUrl: string) {
    const now = Date.now();
    window.location.href = appUrl;

    setTimeout(() => {
      if (Date.now() - now < 2000 && !document.hidden) {
        window.open(webUrl, "_blank");
      }
    }, 1200);
  }

  function startKakaoNavi(course: Course) {
    const name = course.destination.place_name;
    const destLat = course.destination.y;
    const destLng = course.destination.x;

    const appUrl =
      latitude !== null && longitude !== null
        ? `kakaomap://route?sp=${latitude},${longitude}&ep=${destLat},${destLng}&by=CAR`
        : `kakaomap://route?ep=${destLat},${destLng}&by=CAR`;

    const webUrl = `https://map.kakao.com/link/to/${encodeURIComponent(name)},${destLat},${destLng}`;

    tryAppThenWebFallback(appUrl, webUrl);
  }

  function startNaverNavi(course: Course) {
    const name = encodeURIComponent(course.destination.place_name);
    const destX = course.destination.x;
    const destY = course.destination.y;
    const appName = encodeURIComponent(
      typeof window !== "undefined" ? window.location.hostname : "drive-ai"
    );

    let appUrl = `nmap://route/car?dlat=${destY}&dlng=${destX}&dname=${name}&appname=${appName}`;
    if (latitude !== null && longitude !== null) {
      const startName = encodeURIComponent(start || "출발지");
      appUrl =
        `nmap://route/car?slat=${latitude}&slng=${longitude}&sname=${startName}` +
        `&dlat=${destY}&dlng=${destX}&dname=${name}&appname=${appName}`;
    }

    const webUrl =
      latitude !== null && longitude !== null
        ? `https://m.map.naver.com/route.nhn?menu=route&pathType=0&showMap=true&sx=${longitude}&sy=${latitude}&sname=${encodeURIComponent(
            start || "출발지"
          )}&ex=${destX}&ey=${destY}&ename=${name}`
        : `https://map.naver.com/p/search/${name}`;

    tryAppThenWebFallback(appUrl, webUrl);
  }

  function startTmapNavi(course: Course) {
    const name = encodeURIComponent(course.destination.place_name);
    const destLat = course.destination.y;
    const destLng = course.destination.x;

    let appUrl = `tmap://route?rGoName=${name}&rGoX=${destLng}&rGoY=${destLat}&goalname=${name}&goalx=${destLng}&goaly=${destLat}`;
    if (latitude !== null && longitude !== null) {
      appUrl += `&rStName=${encodeURIComponent(start || "출발지")}&rStX=${longitude}&rStY=${latitude}`;
    }

    const webUrl = `https://www.tmap.co.kr/tmap2/mobile/search.jsp?searchword=${name}`;
    tryAppThenWebFallback(appUrl, webUrl);
  }

  function playCourseMood(course: Course) {
    const keywords = [musicMood, ...(course.musicKeywords || [])].filter(Boolean).join(" ");
    window.open(
      `https://music.youtube.com/search?q=${encodeURIComponent(keywords + " 드라이브 플레이리스트")}`,
      "_blank"
    );
  }

  return (
    <main className="h-screen overflow-hidden bg-slate-100">
      <div className="flex h-full">
        <aside className="flex w-[400px] flex-shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="flex items-center gap-3 border-b border-slate-800 bg-slate-900 px-5 py-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
              <Navigation size={20} className="text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white">DRIVE AI</h1>
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Navigation Intelligence
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="border-b border-slate-200 p-5">
              <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 focus-within:border-blue-600 focus-within:ring-1 focus-within:ring-blue-600">
                <Search size={18} className="flex-shrink-0 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") recommend();
                  }}
                  placeholder="어디로 갈까요? (예: 야경 이쁜 곳으로 가고싶어)"
                  className="min-w-0 flex-1 border-none bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
                <button
                  onClick={startVoice}
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-white transition ${
                    isListening ? "bg-red-500" : "bg-slate-700 hover:bg-slate-800"
                  }`}
                >
                  <Mic size={15} />
                </button>
              </div>

              <button
                onClick={() => recommend()}
                disabled={loading}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {loading ? "경로 분석 중..." : "AI 추천 코스 3개 생성"}
              </button>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {QUICK_QUERIES.map((text) => (
                  <button
                    key={text}
                    onClick={() => {
                      setQuery(text);
                      recommend(text);
                    }}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-b border-slate-200 p-5">
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                <MapPin size={12} /> 출발지
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    setIsCurrentLocation(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmCustomStart();
                  }}
                  onBlur={confirmCustomStart}
                  placeholder="출발지 입력 후 Enter"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
                <button
                  onClick={getMyLocation}
                  title="현재 위치 사용"
                  className={`flex items-center justify-center rounded-lg border px-3 transition ${
                    isCurrentLocation
                      ? "border-blue-600 bg-blue-50 text-blue-600"
                      : "border-slate-300 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <Locate size={16} />
                </button>
              </div>
              {geocodingStart && (
                <p className="mt-1 text-[11px] text-slate-400">출발지 위치를 확인하는 중...</p>
              )}
              {!isCurrentLocation && latitude !== null && (
                <p className="mt-1 text-[11px] text-blue-600">이 위치를 출발지로 사용합니다</p>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2">
                  <Clock size={14} className="flex-shrink-0 text-slate-400" />
                  <input
                    type="number"
                    min={1}
                    max={24}
                    step={0.5}
                    value={durationHours}
                    onChange={(e) => setDurationHours(e.target.value)}
                    className="w-full min-w-0 border-none bg-transparent text-sm outline-none"
                  />
                  <span className="whitespace-nowrap text-xs text-slate-400">시간</span>
                </div>

                <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                  <button
                    onClick={() => setRouteType("왕복")}
                    className={`rounded-md py-1.5 text-sm font-bold transition ${
                      routeType === "왕복" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    왕복
                  </button>
                  <button
                    onClick={() => setRouteType("편도")}
                    className={`rounded-md py-1.5 text-sm font-bold transition ${
                      routeType === "편도" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    편도
                  </button>
                </div>
              </div>
            </div>

            <div className="p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Drive Assistant
              </p>
              <div className="mt-2 whitespace-pre-line rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                {aiComment}
              </div>
            </div>
          </div>
        </aside>

        <section className="relative min-w-0 flex-1">
          <div ref={mapElement} className="h-full w-full" />

          <button
            onClick={getMyLocation}
            className="absolute bottom-24 right-6 z-[1000] flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg transition hover:bg-slate-50"
          >
            <Locate size={18} />
          </button>

          <button
            onClick={startVoice}
            className={`absolute bottom-6 right-6 z-[1000] flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl transition ${
              isListening ? "bg-red-500" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            <Mic size={22} />
          </button>

          {courses.length > 0 && (
            <div className="absolute bottom-6 left-5 z-[1000] w-[380px] max-h-[72vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-blue-600">
                    AI Recommendation
                  </p>
                  <h2 className="mt-0.5 text-base font-bold text-slate-900">
                    추천 코스 {courses.length}개
                  </h2>
                </div>
                <button
                  onClick={() => recommend()}
                  className="flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <Dice5 size={13} /> 재추천
                </button>
              </div>

              {notice && <p className="mt-2 text-[11px] text-slate-400">{notice}</p>}

              <div className="mt-4 space-y-2.5">
                {courses.map((course) => (
                  <button
                    key={course.rank}
                    onClick={() => selectCourse(course)}
                    className={`w-full rounded-lg border p-4 text-left transition ${
                      selectedCourse?.rank === course.rank
                        ? "border-blue-600 bg-blue-50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wide text-blue-600">
                          추천 {course.rank}
                        </div>
                        <div className="mt-0.5 font-bold text-slate-900">{course.title}</div>
                      </div>
                      <div className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">
                        {course.score}
                      </div>
                    </div>

                    <p className="mt-2 text-sm leading-5 text-slate-600">{course.reason}</p>

                    <div className="mt-3 flex items-center gap-1.5 text-sm font-medium text-slate-800">
                      <MapPin size={14} className="text-slate-400" /> {course.destination.place_name}
                    </div>

                    <div className="mt-2 flex gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Route size={12} /> 편도 {course.estimatedDistanceKm ?? "-"}km
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={12} /> 약 {course.estimatedMinutes ?? "-"}분
                      </span>
                    </div>

                    {course.nearbyCafes?.length || course.nearbyRestaurants?.length ? (
                      <div className="mt-2 space-y-1 text-xs text-slate-500">
                        {!!course.nearbyCafes?.length && (
                          <div className="flex items-center gap-1">
                            <Coffee size={12} /> {course.nearbyCafes.join(", ")}
                          </div>
                        )}
                        {!!course.nearbyRestaurants?.length && (
                          <div className="flex items-center gap-1">
                            <Utensils size={12} /> {course.nearbyRestaurants.join(", ")}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {course.blogUrl && (
                      
                        href={course.blogUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2 flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                      >
                        <ExternalLink size={12} /> {course.blogTitle}
                      </a>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedCourse && (
            <div className="absolute right-5 top-5 z-[1000] w-[340px] max-h-[80vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-blue-600">
                    선택한 코스
                  </p>
                  <h3 className="mt-0.5 font-bold text-slate-900">{selectedCourse.title}</h3>
                </div>
                <div className="rounded-md bg-emerald-100 px-2 py-1 text-sm font-bold text-emerald-700">
                  {selectedCourse.score}
                </div>
              </div>

              <div className="mt-3 flex gap-4 text-sm text-slate-600">
                <span className="flex items-center gap-1">
                  <Route size={14} className="text-slate-400" /> 편도{" "}
                  {selectedCourse.estimatedDistanceKm ?? "-"}km
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={14} className="text-slate-400" /> 약{" "}
                  {selectedCourse.estimatedMinutes ?? "-"}분
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {selectedCourse.highlights?.map((item) => (
                  <span
                    key={item}
                    className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"
                  >
                    {item}
                  </span>
                ))}
              </div>

              {selectedCourse.blogUrl && (
                
                  href={selectedCourse.blogUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 block rounded-lg border border-slate-200 bg-slate-50 p-3 transition hover:bg-slate-100"
                >
                  <p className="flex items-center gap-1 text-xs font-bold text-blue-600">
                    <ExternalLink size={12} /> {selectedCourse.blogTitle}
                  </p>
                  {selectedCourse.blogSummary && (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                      {selectedCourse.blogSummary}
                    </p>
                  )}
                </a>
              )}

              <div className="mt-5">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  내비게이션 실행
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => startKakaoNavi(selectedCourse)}
                    className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 py-3 text-xs font-bold text-slate-700 transition hover:border-yellow-400 hover:bg-yellow-50"
                  >
                    <Navigation size={16} />
                    카카오맵
                  </button>
                  <button
                    onClick={() => startNaverNavi(selectedCourse)}
                    className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 py-3 text-xs font-bold text-slate-700 transition hover:border-emerald-400 hover:bg-emerald-50"
                  >
                    <Navigation size={16} />
                    네이버지도
                  </button>
                  <button
                    onClick={() => startTmapNavi(selectedCourse)}
                    className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 py-3 text-xs font-bold text-slate-700 transition hover:border-red-400 hover:bg-red-50"
                  >
                    <Navigation size={16} />
                    TMAP
                  </button>
                </div>
                <p className="mt-2 text-[10px] leading-4 text-slate-400">
                  모바일에 해당 지도 앱이 설치되어 있으면 바로 내비게이션이 실행됩니다. 앱이 없거나
                  PC에서 열면 웹페이지로 대체됩니다.
                </p>
              </div>

              <button
                onClick={() => playCourseMood(selectedCourse)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
              >
                <Play size={14} /> YouTube Music으로 이 코스 무드 재생
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
