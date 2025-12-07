// src/FriendsPage.jsx
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
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
  const [screentime, setScreentime] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewedPortrait, setViewedPortrait] = useState(null);
  const [selectedPortrait, setSelectedPortrait] = useState(null);
  const [carouselApi, setCarouselApi] = useState(null);

  // Project start date - adjust this as needed
  const PROJECT_START_DATE = new Date("2025-09-21T04:00:00.000Z");

  // Function to calculate week number based on Sunday midnight America/New_York timezone cutoff
  const calculateWeekNumber = (imageTimestamp) => {
    const imageDate = new Date(imageTimestamp);

    // Convert dates to America/New_York timezone
    const imageNY = new Date(imageDate.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const startNY = new Date(
      PROJECT_START_DATE.toLocaleString("en-US", { timeZone: "America/New_York" })
    );

    // Find the Sunday midnight before or on the image date
    const imageDayOfWeek = imageNY.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const imageSunday = new Date(imageNY);
    imageSunday.setDate(imageSunday.getDate() - imageDayOfWeek);
    imageSunday.setHours(0, 0, 0, 0); // Set to midnight

    // Find the Sunday midnight before or on the start date
    const startDayOfWeek = startNY.getDay();
    const startSunday = new Date(startNY);
    startSunday.setDate(startSunday.getDate() - startDayOfWeek);
    startSunday.setHours(0, 0, 0, 0); // Set to midnight

    // Calculate the difference in weeks
    const timeDiff = imageSunday.getTime() - startSunday.getTime();
    const weeksDiff = Math.floor(timeDiff / (7 * 24 * 60 * 60 * 1000));

    return weeksDiff + 1; // Week numbers start at 1
  };

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
    // fetchScreentime();
    // const interval = setInterval(() => {
    //   fetchHistory();
    //   fetchScreentime();
    // }, 15000);
    // return () => clearInterval(interval);
  }, [fetchHistory, fetchScreentime]);

  // Set the selected and viewed portrait to the most recent one when history changes
  useEffect(() => {
    if (history.length > 0 && !selectedPortrait) {
      setSelectedPortrait(history[0]);
      setViewedPortrait(history[0]);
    }
  }, [history, selectedPortrait]);

  // Scroll carousel to the last page when it loads
  useEffect(() => {
    if (carouselApi && history.length > 0) {
      // Since we show 3 items per page (basis-1/3), calculate the last page
      const itemsPerPage = 3;
      const lastPageIndex = history.length - itemsPerPage;
      // Scroll to the last page
      carouselApi.scrollTo(lastPageIndex);
    }
  }, [carouselApi, history.length]);

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

  const userToScreenTimeMapping = {
    tiffany: {
      days: 1,
      hours: 4,
      mins: 30,
    },
    lele: {
      days: 2,
      hours: 14,
      mins: 30,
    },
    ameya: {
      days: 0,
      hours: 23,
      mins: 0,
    },
    serena: {
      days: 0,
      hours: 6,
      mins: 0,
    },
    isaac: {
      days: 2,
      hours: 6,
      mins: 30,
    },
  };

  return (
    <div className="flex flex-col md:flex-row justify-center items-start gap-10 w-full">
      {/* Portrait image */}
      <div className="flex-shrink-0">
        {isLoading ? (
          <div className="text-center p-8 flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-[spin_1s_linear_infinite]"></div>
            <p className="text-white">Loading portrait...</p>
          </div>
        ) : error ? (
          <p className="text-center text-red-500">Error: {error}</p>
        ) : viewedPortrait ? (
          <img
            src={viewedPortrait.imageUrl}
            alt={`Version ${viewedPortrait.version} of ${user}'s portrait`}
            className="block w-full max-w-sm md:max-w-md lg:max-w-[400px] h-auto mx-auto"
          />
        ) : (
          <div className="text-center p-8 border-2 border-dashed text-white rounded-lg">
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
              <em>
                Portrait of {plaqueName} (Version {viewedPortrait.version})
              </em>
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

        {screentime ? (
          <div className="bg-gray-100 text-gray-800 p-6">
            {/* Most Recent Unproductive Activity */}
            {/* {screentime.mostRecentUnproductiveActivity && (
              <div className="mb-4">
                <div className="text-sm text-gray-800 flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span>
                    <span>
                      {" "}
                      Latest distraction:
                      <strong> {screentime.mostRecentUnproductiveActivity.activity}</strong>
                      {screentime.mostRecentUnproductiveActivity.category &&
                        ` (${screentime.mostRecentUnproductiveActivity.category})`}
                    </span>
                    <span className="ml-2 text-gray-400 text-xs">
                      {new Date(screentime.mostRecentUnproductiveActivity.timestamp).toLocaleString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        }
                      )}
                    </span>
                  </span>
                </div>
              </div>
            )} */}

            <div className="flex justify-between gap-6">
              <div className="text-center flex-1">
                <div className="mb-3 font-bold">Total Unproductive Screen Time</div>
                <div className="flex justify-center gap-8">
                  <>
                    <div className="flex flex-col items-center">
                      <div className="text-4xl font-bold text-gray-800">
                        {userToScreenTimeMapping[user].days}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">days</div>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="text-4xl font-bold text-gray-800">
                        {userToScreenTimeMapping[user].hours}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">hours</div>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="text-4xl font-bold text-gray-800">
                        {userToScreenTimeMapping[user].mins}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">mins</div>
                    </div>
                  </>
                </div>
              </div>

              {/* <div className="text-center flex-1">
                <div className="text-2xl text-gray-800 font-bold mb-1">
                  {screentime.unproductiveMinutes
                    ? `${Math.floor(screentime.unproductiveMinutes / 60)}h ${Math.floor(
                        screentime.unproductiveMinutes % 60
                      )}m`
                    : "0h 0m"}
                </div>
                <div className="text-sm text-gray-600 leading-tight">This Week's Brainrot Time</div>
              </div>

     
              <div className="text-center flex-1">
                <div className="text-2xl text-gray-800 font-bold mb-1">
                  {screentime.totalUnproductiveMinutes
                    ? `${Math.floor(screentime.totalUnproductiveMinutes / 60)}h ${Math.floor(
                        screentime.totalUnproductiveMinutes % 60
                      )}m`
                    : "0h 0m"}
                </div>
                <div className="text-sm text-gray-600 leading-tight">Total Brainrot Past Month</div>
              </div> */}
            </div>

            {/* <div className="text-xs text-gray-500 text-center mt-4">
              Next image at{" "}
              {screentime.nextThreshold
                ? `${Math.floor(screentime.nextThreshold / 60)}h ${Math.floor(
                    screentime.nextThreshold % 60
                  )}m`
                : "0h 0m"}
            </div> */}

            <div className="text-xs text-gray-500 text-center mt-4">
              A new image was generated every 30 minutes of brainrot time.
            </div>
          </div>
        ) : (
          <div className="bg-gray-100 text-gray-800 py-12 px-6 flex items-center justify-center gap-3">
            <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-[spin_1s_linear_infinite]"></div>
            <p className="text-sm text-gray-600">Loading screentime data...</p>
          </div>
        )}

        {/* Photo Carousel */}
        {history.length > 0 && (
          <div className="flex justify-center">
            <Carousel className="w-[calc(100%-30px)]" setApi={setCarouselApi}>
              <CarouselContent className="-ml-2">
                {history
                  .slice()
                  .reverse()
                  .map((portrait) => {
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
                          <div className="relative overflow-hidden rounded-md bg-gray-800">
                            <img
                              src={portrait.thumbnailUrl || portrait.imageUrl}
                              alt={`Version ${portrait.version}`}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute top-1 left-1 bg-black/40 text-white text-xs px-2 py-1 rounded">
                              <i>Week {calculateWeekNumber(portrait.timestamp)}</i>
                            </div>
                          </div>
                        </div>
                      </CarouselItem>
                    );
                  })}
              </CarouselContent>
              <CarouselPrevious className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700" />
              <CarouselNext className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700" />
            </Carousel>
          </div>
        )}
      </div>
    </div>
  );
}

function FriendsPage() {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

  return (
    <div className="min-h-screen flex flex-col items-center p-8">
      {/* Back to Main Gallery link in top left */}
      <Link
        to="/"
        className="fixed top-8 left-8 text-sm text-gray-400 hover:text-white transition-colors z-10"
      >
        ← Back to Main Gallery
      </Link>

      <header className="w-full max-w-6xl animate-[fadeInFromTop_2s_ease-out] py-16">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white text-center mb-4">
          Wall of Shame
        </h1>
        <p className="text-lg text-gray-300 max-w-3xl mx-auto text-center leading-relaxed">
          Our friends have joined the experiment, each with their own evolving portrait as a
          communal act of surveillance.
        </p>
      </header>

      {/* stack vertically */}
      <main className="w-full max-w-6xl flex flex-col gap-30 flex-grow py-8">
        <div className="animate-[fadeIn_2s_ease-out_1s_both]">
          <h2 className="text-2xl font-bold tracking-tight mb-12 text-white text-center">
            Tiffany
          </h2>
          <UserSection user="tiffany" plaqueName="Tiffany Wang" API_BASE_URL={API_BASE_URL} />
        </div>
        <div className="animate-[fadeIn_2s_ease-out_0.5s_both]">
          <h2 className="text-2xl font-bold tracking-tight mb-12 text-white text-center">Lele</h2>
          <UserSection user="lele" plaqueName="Lele Zhang" API_BASE_URL={API_BASE_URL} />
        </div>
        <div className="animate-[fadeIn_2s_ease-out_1.5s_both]">
          <h2 className="text-2xl font-bold tracking-tight mb-12 text-white text-center">Ameya</h2>
          <UserSection user="ameya" plaqueName="Ameya Jadhav" API_BASE_URL={API_BASE_URL} />
        </div>
        <div className="animate-[fadeIn_2s_ease-out_0.75s_both]">
          <h2 className="text-2xl font-bold tracking-tight mb-12 text-white text-center">Serena</h2>
          <UserSection user="serena" plaqueName="Serena Mao" API_BASE_URL={API_BASE_URL} />
        </div>

        <div className="animate-[fadeIn_2s_ease-out_1.25s_both]">
          <h2 className="text-2xl font-bold tracking-tight mb-12 text-white text-center">Isaac</h2>
          <UserSection user="isaac" plaqueName="Isaac Sun" API_BASE_URL={API_BASE_URL} />
        </div>
      </main>

      <footer
        className="w-full max-w-6xl mt-12 mb-4 text-center gap-2 flex flex-col"
        style={{ color: "#ababab" }}
      >
        <p className="text-sm text-gray-400">
          Interested in adding your own portrait to this gallery? Reach out{" "}
          <a
            href="mailto:emily49@stanford.edu"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white relative inline-block transition-colors duration-300 after:content-[''] after:absolute after:w-full after:h-0.5 after:bg-white after:left-0 after:bottom-0 after:scale-x-0 after:origin-left after:transition-transform after:duration-300 hover:after:scale-x-100"
          >
            here
          </a>
          .
        </p>
        <p className="text-sm text-gray-400">
          {" "}
          Made by{" "}
          <a
            href="https://x.com/thatsnotoptimal"
            className="text-white relative inline-block transition-colors duration-300 after:content-[''] after:absolute after:w-full after:h-0.5 after:bg-white after:left-0 after:bottom-0 after:scale-x-0 after:origin-left after:transition-transform after:duration-300 hover:after:scale-x-100"
          >
            Justin Guo
          </a>{" "}
          and{" "}
          <a
            href="https://x.com/emilyzsh"
            className="text-white relative inline-block transition-colors duration-300 after:content-[''] after:absolute after:w-full after:h-0.5 after:bg-white after:left-0 after:bottom-0 after:scale-x-0 after:origin-left after:transition-transform after:duration-300 hover:after:scale-x-100"
          >
            Emily Zhang
          </a>
          .
        </p>
      </footer>
    </div>
  );
}

export default FriendsPage;
