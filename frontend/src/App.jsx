// src/App.jsx
import { useState, useEffect, useCallback } from "react";
import "./App.css";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";

function UserSection({ user, plaqueName, API_BASE_URL }) {
  const [history, setHistory] = useState([]);
  const [screentime, setScreentime] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewedPortrait, setViewedPortrait] = useState(null);
  const [selectedPortrait, setSelectedPortrait] = useState(null);

  const HISTORY_URL = `${API_BASE_URL}/api/${user}/portrait-history`;
  const SCREEN_URL = `${API_BASE_URL}/api/${user}/current-screentime`;

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(HISTORY_URL);
      if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
      const data = await res.json();
      if (data.success) setHistory(data.history);
      else throw new Error(data.error || "Failed to fetch history");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [HISTORY_URL]);

  const fetchScreentime = useCallback(async () => {
    try {
      const res = await fetch(SCREEN_URL);
      if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
      const data = await res.json();
      if (data.success) setScreentime(data);
    } catch (err) {
      console.error("Error fetching screentime:", err);
    }
  }, [SCREEN_URL]);

  useEffect(() => {
    fetchHistory();
    fetchScreentime();
    const interval = setInterval(() => {
      fetchHistory();
      fetchScreentime();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchHistory, fetchScreentime]);

  // Set the selected and viewed portrait to the most recent one when history changes
  useEffect(() => {
    if (history.length > 0 && !selectedPortrait) {
      setSelectedPortrait(history[0]);
      setViewedPortrait(history[0]);
    }
  }, [history, selectedPortrait]);

  const handlePortraitHover = (portrait) => {
    setViewedPortrait(portrait);
  };

  const handlePortraitLeave = () => {
    setViewedPortrait(selectedPortrait);
  };

  const handlePortraitClick = (portrait) => {
    setSelectedPortrait(portrait);
    setViewedPortrait(portrait);
  };

  return (
    <div className="flex flex-col md:flex-row justify-center items-start gap-10 py-8 w-full">
      {/* Portrait image */}
      <div className="frame flex-shrink-0">
        {isLoading ? (
          <p className="text-center">Loading...</p>
        ) : error ? (
          <p className="text-center text-red-500">Error: {error}</p>
        ) : viewedPortrait ? (
          <img
            src={viewedPortrait.imageUrl}
            alt={`Version ${viewedPortrait.version} of ${user}'s portrait`}
            className="block w-full max-w-sm md:max-w-md lg:max-w-[400px] h-auto"
          />
        ) : (
          <div className="text-center p-8 border-2 border-dashed rounded-lg">
            <p>No portraits yet for {plaqueName}.</p>
          </div>
        )}
      </div>

      {/* Right side: plaque + screentime */}
      <div className="flex flex-col gap-4 w-full md:max-w-md">
        {viewedPortrait && (
          <div className="bg-gray-100 text-gray-800 p-6">
            <p className="font-bold text-base">{plaqueName}</p>
            <p className="font-bold text-base">
              <em>Portrait of You (Version {viewedPortrait.version})</em>
            </p>
            <p className="text-sm">
              {new Date(viewedPortrait.timestamp).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
            <p className="text-sm text-gray-800">Digital, AI Generation</p>

            <br />
            <div className="text-sm leading-relaxed m-0 min-h-[3rem] max-h-[3rem] overflow-y-auto">
              <p className="m-0">The last transformation: "{viewedPortrait.prompt}"</p>
            </div>
          </div>
        )}

        {screentime && (
          <div className="bg-gray-100 text-gray-800 p-6 pb-4">
            <div className="flex justify-between gap-6">
              {/* Weekly Brainrot Time */}
              <div className="text-center flex-1">
                <div className="text-2xl text-gray-800 font-bold mb-1">
                  {Math.floor(screentime.unproductiveMinutes)}m
                </div>
                <div className="text-sm text-gray-600 leading-tight">This Week's Brainrot Time</div>
              </div>

              {/* Total Brainrot Time */}
              <div className="text-center flex-1">
                <div className="text-2xl text-gray-800 font-bold mb-1">
                  {screentime.totalUnproductiveMinutes
                    ? `${Math.floor(screentime.totalUnproductiveMinutes / 60)}h ${Math.floor(
                        screentime.totalUnproductiveMinutes % 60
                      )}m`
                    : "0h 0m"}
                </div>
                <div className="text-sm text-gray-600 leading-tight">
                  Total Brainrot Since Start
                </div>
              </div>
            </div>

            <div className="text-xs text-gray-500 text-center mt-4">
              Next image at {screentime.nextThreshold}m
            </div>
            <div className="text-xs text-gray-500 text-center">
              Portrait resets every Sunday at midnight EST
            </div>
          </div>
        )}

        {/* Photo Carousel */}
        {history.length > 0 && (
          <div className="flex justify-center">
            <Carousel className="w-[calc(100%-30px)]">
              <CarouselContent className="-ml-2">
                {history.map((portrait, index) => {
                  const isSelected = selectedPortrait && selectedPortrait.id === portrait.id;
                  return (
                    <CarouselItem key={portrait.id} className="basis-1/3 pl-2">
                      <div
                        className={`p-1 cursor-pointer transition-all duration-200 ${
                          isSelected ? "opacity-100" : "opacity-60 hover:opacity-80"
                        }`}
                        onMouseEnter={() => handlePortraitHover(portrait)}
                        onMouseLeave={handlePortraitLeave}
                        onClick={() => handlePortraitClick(portrait)}
                      >
                        <div className="overflow-hidden rounded-md bg-gray-100">
                          <img
                            src={portrait.imageUrl}
                            alt={`Version ${portrait.version}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </div>
                    </CarouselItem>
                  );
                })}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

  return (
    <div className="min-h-screen flex flex-col items-center p-8 pt-12">
      <header className="w-full max-w-6xl text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Portrait of You</h1>
        <p className="text-lg text-gray-300 max-w-4xl mx-auto">
          A living artwork that evolves with your digital habits. Each portrait reflects the hidden
          cost of unproductive screen time, capturing the slow transformation of identity in the age
          of distraction.
        </p>
      </header>

      {/* stack vertically */}
      <main className="w-full max-w-6xl flex flex-col gap-12">
        <UserSection user="justin" plaqueName="Justin Guo" API_BASE_URL={API_BASE_URL} />
        <UserSection user="emily" plaqueName="Emily Zhang" API_BASE_URL={API_BASE_URL} />
      </main>
    </div>
  );
}

export default App;
