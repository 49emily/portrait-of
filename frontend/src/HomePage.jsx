// src/HomePage.jsx
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import "./App.css";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
// eslint-disable-next-line no-unused-vars
import { motion, useScroll, useTransform } from "framer-motion";

const VideoPlayer = ({ video }) =>
  useMemo(
    () => (
      <div className="w-64 aspect-[9/16] rounded-lg overflow-hidden bg-black flex-shrink-0">
        <video
          src={video.videoUrl}
          autoPlay
          muted
          loop
          playsInline
          className="w-full h-full object-cover"
          preload="none"
        >
          Your browser does not support the video tag.
        </video>
      </div>
    ),
    [video.videoUrl]
  );

function VideoSection({ API_BASE_URL }) {
  const [videos, setVideos] = useState({});
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });
  // Calculate the transform needed to show all content
  const [transformRange, setTransformRange] = useState(["0%", "-35%"]);

  // Project start date - same as in UserSection
  const PROJECT_START_DATE = new Date("2025-09-21T04:00:00.000Z");

  // Function to calculate the Sunday of a given week number
  const getSundayOfWeek = (weekNumber) => {
    const startNY = new Date(
      PROJECT_START_DATE.toLocaleString("en-US", { timeZone: "America/New_York" })
    );

    // Find the Sunday midnight before or on the start date
    const startDayOfWeek = startNY.getDay();
    const startSunday = new Date(startNY);
    startSunday.setDate(startSunday.getDate() - startDayOfWeek);
    startSunday.setHours(0, 0, 0, 0);

    // Calculate the target Sunday
    const targetSunday = new Date(startSunday);
    targetSunday.setDate(startSunday.getDate() + (weekNumber - 1) * 7);

    return targetSunday;
  };

  useEffect(() => {
    const calculateTransform = () => {
      if (containerRef.current) {
        const container = containerRef.current.querySelector(".sticky");
        const content = containerRef.current.querySelector("[data-content]");

        if (container && content) {
          const containerWidth = container.offsetWidth;
          const contentWidth = content.scrollWidth;
          const maxTransform = -((contentWidth - containerWidth) / contentWidth) * 100;
          setTransformRange(["0%", `${Math.min(maxTransform, -10)}%`]);
        }
      }
    };

    calculateTransform();
    window.addEventListener("resize", calculateTransform);

    return () => window.removeEventListener("resize", calculateTransform);
  }, [videos]);

  const x = useTransform(scrollYProgress, [0, 1], transformRange);

  const fetchVideos = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/videos`);
      if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setVideos(data.videos);
      }
    } catch (err) {
      console.error("Error fetching videos:", err);
    }
  }, [API_BASE_URL]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const VideoPlaceholder = ({ week, user }) => {
    const sundayDate = getSundayOfWeek(week + 1);
    const formattedDate = sundayDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    return (
      <div className="w-64 aspect-[9/16] bg-transparent border-2 border-dashed border-gray-400 rounded-lg flex items-center justify-center flex-shrink-0">
        <div className="text-center text-gray-400 px-4">
          <div className="text-sm">Week {week} Replay</div>
          <div className="text-xs capitalize">{user}</div>
          <div className="text-xs">Will be generated on {formattedDate}</div>
        </div>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="h-[250vh] relative w-full">
      <div className="sticky top-0 h-[100vh] flex items-center overflow-hidden w-full">
        <h2 className="absolute top-[6vh] left-1/2 transform -translate-x-1/2 text-3xl font-bold text-white z-10">
          History
        </h2>
        <motion.div style={{ x }} className="flex gap-8 lg:px-20" data-content>
          {[1, 2, 3, 4, 5].map((week) => (
            <div key={week} className="flex-shrink-0 space-y-4">
              <div className="text-lg text-gray-300 text-center font-medium">Week {week}</div>
              <div className="flex gap-4">
                {/* Justin's video */}
                <div className="space-y-2">
                  {videos[week]?.justin ? (
                    <VideoPlayer video={videos[week].justin} />
                  ) : (
                    <VideoPlaceholder week={week} user="justin" />
                  )}
                </div>
                {/* Emily's video */}
                <div className="space-y-2">
                  {videos[week]?.emily ? (
                    <VideoPlayer video={videos[week].emily} />
                  ) : (
                    <VideoPlaceholder week={week} user="emily" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

function UserSection({ user, plaqueName, API_BASE_URL }) {
  const [history, setHistory] = useState([]);
  const [screentime, setScreentime] = useState(null);
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
          <div className="bg-gray-100 text-gray-800 py-4 px-6">
            {/* Most Recent Unproductive Activity */}
            {screentime.mostRecentUnproductiveActivity && (
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
            )}

            <div className="flex justify-between gap-6">
              {/* Weekly Brainrot Time */}
              <div className="text-center flex-1">
                <div className="text-2xl text-gray-800 font-bold mb-1">
                  {screentime.unproductiveMinutes
                    ? `${Math.floor(screentime.unproductiveMinutes / 60)}h ${Math.floor(
                        screentime.unproductiveMinutes % 60
                      )}m`
                    : "0h 0m"}
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
                <div className="text-sm text-gray-600 leading-tight">Total Brainrot Past Month</div>
              </div>
            </div>

            <div className="text-xs text-gray-500 text-center mt-4">
              Next image at{" "}
              {screentime.nextThreshold
                ? `${Math.floor(screentime.nextThreshold / 60)}h ${Math.floor(
                    screentime.nextThreshold % 60
                  )}m`
                : "0h 0m"}
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

// Component to display the most recent videos
function RecentVideos({ API_BASE_URL }) {
  const [videos, setVideos] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/videos`);
        if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
        const data = await res.json();
        if (data.success) {
          setVideos(data.videos);
        }
      } catch (err) {
        console.error("Error fetching videos:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchVideos();
  }, [API_BASE_URL]);

  // Get the most recent videos for both users
  const getMostRecentVideos = () => {
    const weeks = Object.keys(videos)
      .map(Number)
      .sort((a, b) => b - a);

    for (const week of weeks) {
      if (videos[week]?.justin && videos[week]?.emily) {
        return {
          justin: videos[week].justin,
          emily: videos[week].emily,
          week,
        };
      }
    }
    return null;
  };

  const recentVideos = getMostRecentVideos();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-4">
          <div className="w-36 md:w-64 aspect-[9/16] bg-gray-800 rounded-lg animate-pulse"></div>
          <div className="w-36 md:w-64 aspect-[9/16] bg-gray-800 rounded-lg animate-pulse"></div>
        </div>
        <p className="text-sm text-gray-400 text-center italic">
          Last week's (de)generative video replay
        </p>
      </div>
    );
  }

  if (!recentVideos) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-4">
          <div className="w-36 md:w-64 aspect-[9/16] bg-transparent border-2 border-dashed border-gray-400 rounded-lg flex items-center justify-center">
            <div className="text-center text-gray-400 px-2">
              <div className="text-xs">No videos yet</div>
            </div>
          </div>
          <div className="w-36 md:w-64 aspect-[9/16] bg-transparent border-2 border-dashed border-gray-400 rounded-lg flex items-center justify-center">
            <div className="text-center text-gray-400 px-2">
              <div className="text-xs">No videos yet</div>
            </div>
          </div>
        </div>
        <p className="text-sm text-gray-400 text-center italic">
          Last week's (de)generative video replay
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-4">
        <div className="w-36 md:w-64 aspect-[9/16] rounded-lg overflow-hidden bg-black shadow-lg">
          <video
            src={recentVideos.justin.videoUrl}
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-cover"
            preload="none"
          >
            Your browser does not support the video tag.
          </video>
        </div>
        <div className="w-36 md:w-64 aspect-[9/16] rounded-lg overflow-hidden bg-black shadow-lg">
          <video
            src={recentVideos.emily.videoUrl}
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-cover"
            preload="none"
          >
            Your browser does not support the video tag.
          </video>
        </div>
      </div>
      <p className="text-sm text-gray-400 text-center italic">
        Last week's (de)generative video replay
      </p>
    </div>
  );
}

function HomePage() {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

  return (
    <div className="min-h-screen flex flex-col items-center p-8">
      <header className="w-full max-w-6xl animate-[fadeInFromTop_2s_ease-out] py-16">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white text-center mb-4">
          Portrait of You
        </h1>
        <h2 className="text-xl md:text-2xl tracking-tight mb-16 text-white text-center">
          Justin Guo and Emily Zhang
        </h2>
        <div className="flex flex-col lg:flex-row items-center lg:items-center gap-8 lg:gap-16">
          {/* Left side: Recent Videos */}
          <div className="flex-shrink-0 order-2 lg:order-1">
            <RecentVideos API_BASE_URL={API_BASE_URL} />
          </div>

          {/* Right side: Description Text */}
          <div className="flex-1 order-1 lg:order-2">
            <p className="text-lg text-gray-300 max-w-4xl lg:text-left text-center leading-relaxed">
              <em>Portrait of You</em> is a series of generative living artworks that evolve with
              digital behavior inspired by Oscar Wilde's <em>The Picture of Dorian Gray</em>. Each
              portrait undergoes a transformation using a generative AI model at every increment of
              its owner's unproductive screen time, capturing the gradual erosion of identity in the
              age of distraction. The portraits will reset weekly at midnight EST on Sunday, giving
              each person a new chance at redefining themselves in an ongoing public installation of
              self-surveillance.
            </p>
          </div>
        </div>
      </header>

      {/* stack vertically */}
      <main className="w-full max-w-6xl flex flex-col gap-20 flex-grow py-16">
        <div className="animate-[fadeIn_2s_ease-out_0.5s_both]">
          <h2 className="text-3xl font-bold tracking-tight mb-16 text-white text-center">
            Live Portraits
          </h2>
          <UserSection user="justin" plaqueName="Justin Guo" API_BASE_URL={API_BASE_URL} />
        </div>
        <div className="animate-[fadeIn_2s_ease-out_1s_both]">
          <UserSection user="emily" plaqueName="Emily Zhang" API_BASE_URL={API_BASE_URL} />
        </div>
      </main>

      {/* Video Section */}
      <VideoSection API_BASE_URL={API_BASE_URL} />

      <footer
        className="w-full max-w-6xl mb-4 text-center gap-2 flex flex-col"
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

export default HomePage;
