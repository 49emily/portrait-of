// src/App.jsx
import { useState, useEffect, useCallback, useMemo } from "react";
import "./App.css";

function App() {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [screentime, setScreentime] = useState(null);

  const API_BASE_URL = "http://localhost:3000";

  // --- derive user from path: /justin or /emily (default: justin) ---
  const user = useMemo(() => {
    const raw = (window.location.pathname || "/")
      .replace(/\/+/g, "/")
      .replace(/^\/|\/$/g, "")
      .toLowerCase();
    return raw === "emily" ? "emily" : "justin";
  }, []);

  const plaqueName = user === "emily" ? "Emily Zhang" : "Justin Guo";
  const partnerName = user === "emily" ? "Justin Guo" : "Emily Zhang";

  const HISTORY_URL = `${API_BASE_URL}/api/${user}/portrait-history`;
  const SCREEN_URL = `${API_BASE_URL}/api/${user}/current-screentime`;

  const fetchHistory = useCallback(async () => {
    try {
      const response = await fetch(HISTORY_URL);
      if (!response.ok)
        throw new Error(`HTTP error! Status: ${response.status}`);
      const data = await response.json();
      if (data.success) {
        setHistory(data.history);
      } else {
        throw new Error(data.error || "Failed to fetch portrait history");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [HISTORY_URL]);

  const fetchScreentime = useCallback(async () => {
    try {
      const response = await fetch(SCREEN_URL);
      if (!response.ok)
        throw new Error(`HTTP error! Status: ${response.status}`);
      const data = await response.json();
      if (data.success) {
        setScreentime(data);
      } else {
        throw new Error(data.error || "Failed to fetch screentime");
      }
    } catch (err) {
      console.error("Error fetching screentime:", err);
    }
  }, [SCREEN_URL]);

  useEffect(() => {
    fetchHistory();
    fetchScreentime();
    const intervalId = setInterval(() => {
      fetchHistory();
      fetchScreentime();
    }, 15000);
    return () => clearInterval(intervalId);
  }, [fetchHistory, fetchScreentime]);

  useEffect(() => {
    setActiveIndex(0);
  }, [history]);

  const handleOlder = () =>
    setActiveIndex((prev) => Math.min(history.length - 1, prev + 1));
  const handleNewer = () => setActiveIndex((prev) => Math.max(0, prev - 1));

  const viewedPortrait = history.length > 0 ? history[activeIndex] : null;
  const currentYear = new Date().getFullYear();

  // simple URL switcher; navigate to /justin or /emily
  const switchUser = (next) => {
    if (next !== user) {
      window.location.href = `/${next}`;
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-6 md:p-8">
      {/* Top bar: user toggle */}
      <header className="w-full max-w-6xl mb-4 flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">
          Dorian Portrait Viewer <span className="opacity-60">({user})</span>
        </h1>
        <div className="inline-flex gap-2">
          <button
            onClick={() => switchUser("justin")}
            className={`px-3 py-2 rounded border ${
              user === "justin"
                ? "bg-white text-black border-white"
                : "bg-transparent text-white border-white/40 hover:border-white"
            }`}
          >
            Justin
          </button>
          <button
            onClick={() => switchUser("emily")}
            className={`px-3 py-2 rounded border ${
              user === "emily"
                ? "bg-white text-black border-white"
                : "bg-transparent text-white border-white/40 hover:border-white"
            }`}
          >
            Emily
          </button>
        </div>
      </header>

      <main className="w-full max-w-6xl">
        {isLoading && <p className="text-center">Loading portrait...</p>}
        {error && <p className="text-center text-red-500">Error: {error}</p>}

        {!isLoading && !error && (
          <>
            {viewedPortrait ? (
              <div className="flex flex-col md:flex-row justify-center items-center gap-10 py-8">
                <div className="frame">
                  <img
                    src={viewedPortrait.imageUrl}
                    alt={`Version ${viewedPortrait.version} of the portrait`}
                    className="block w-full max-w-sm md:max-w-md lg:max-w-[500px] h-auto"
                  />
                </div>

                <div className="flex flex-col gap-4 w-full md:max-w-80">
                  <div className="bg-gray-100 text-gray-800 p-6">
                    <p className="font-bold text-base">
                      {plaqueName} & {partnerName}
                    </p>
                    <p className="font-bold text-base">
                      <em>
                        Portrait of You (Version {viewedPortrait.version})
                      </em>
                      , {currentYear}
                    </p>
                    <p className="text-sm text-gray-800 mb-4">
                      Digital, AI Generation
                    </p>
                    <p className="text-sm leading-relaxed m-0">
                      This piece is a dynamic reflection of the artist's digital
                      self. The portrait degrades over time based on
                      unproductive screen time, serving as a visual metaphor for
                      the unseen toll of digital distraction.
                    </p>
                    <br />
                    <p className="text-sm leading-relaxed m-0">
                      The last transformation: "{viewedPortrait.prompt}"
                    </p>
                  </div>

                  {screentime && (
                    <div className="bg-gray-100 text-gray-800 p-6">
                      <div className="text-sm font-bold mb-3 text-gray-800">
                        Today's Brainrot Time:{" "}
                        {Math.floor(screentime.unproductiveMinutes)}m{" "}
                        {Math.floor((screentime.unproductiveMinutes % 1) * 60)}s
                      </div>
                      <div className="mb-6">
                        <div className="relative h-5 bg-white border border-gray-600 overflow-visible">
                          <div
                            className="h-full bg-gray-800 transition-all duration-300 ease-in-out"
                            style={{
                              width: `${Math.min(
                                (screentime.unproductiveMinutes / 240) * 100,
                                100
                              )}%`,
                            }}
                          />
                          {Array.from({ length: 8 }, (_, i) => {
                            const minutes = (i + 1) * 30;
                            const position = (minutes / 240) * 100;
                            return (
                              <div
                                key={minutes}
                                className="absolute top-0 h-full pointer-events-none"
                                style={{ left: `${position}%` }}
                              >
                                <div className="absolute left-0 top-0 w-px h-full bg-gray-600" />
                                <div className="absolute left-1/2 top-5 transform -translate-x-1/2 text-xs text-gray-600 whitespace-nowrap">
                                  {minutes}m
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 text-center">
                        Next image at {screentime.nextThreshold}m
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center p-8 border-2 border-dashed rounded-lg">
                <p>No portraits yet for {user}.</p>
              </div>
            )}

            {history.length > 1 && (
              <div className="flex justify-between items-center max-w-[500px] mx-auto my-4 mb-8 p-2 bg-white/5 rounded-lg border border-white/10">
                <button
                  onClick={handleNewer}
                  disabled={activeIndex === 0}
                  className="bg-gray-800 text-white border-none py-3 px-6 rounded text-base font-bold cursor-pointer transition-colors duration-200 hover:bg-gray-600 disabled:bg-gray-900 disabled:text-gray-500 disabled:cursor-not-allowed"
                >
                  ← Newer
                </button>
                <span className="text-lg font-bold text-gray-300">
                  {activeIndex + 1} of {history.length} (Version{" "}
                  {viewedPortrait?.version})
                </span>
                <button
                  onClick={handleOlder}
                  disabled={activeIndex === history.length - 1}
                  className="bg-gray-800 text-white border-none py-3 px-6 rounded text-base font-bold cursor-pointer transition-colors duration-200 hover:bg-gray-600 disabled:bg-gray-900 disabled:text-gray-500 disabled:cursor-not-allowed"
                >
                  Older →
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
