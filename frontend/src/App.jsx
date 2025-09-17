// src/App.jsx
import { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const API_BASE_URL = "http://localhost:3000";

  // --- Omitted for brevity: fetchHistory, useEffect, handlers ---
  // (No changes needed in the logic part of the component)
  const fetchHistory = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/portrait-history`);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();
      if (data.success) {
        setHistory(data.history);
      } else {
        throw new Error(data.error || "Failed to fetch portrait history");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      if (isLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    const intervalId = setInterval(fetchHistory, 15000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [history]);

  const handleOlder = () => {
    setActiveIndex((prev) => Math.min(history.length - 1, prev + 1));
  };
  const handleNewer = () => {
    setActiveIndex((prev) => Math.max(0, prev - 1));
  };

  const viewedPortrait = history.length > 0 ? history[activeIndex] : null;
  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen flex flex-col items-center p-8">
      <main className="w-full max-w-6xl">
        {isLoading && <p className="text-center">Loading portrait...</p>}
        {error && <p className="text-center text-red-500">Error: {error}</p>}

        {!isLoading && !error && (
          <>
            {viewedPortrait ? (
              <div className="exhibit-container">
                <div className="frame">
                  <img
                    src={`${API_BASE_URL}/${viewedPortrait.output}`}
                    alt={`Version ${viewedPortrait.version} of the portrait`}
                    className="portrait-image"
                  />
                </div>

                {/* --- Right Side: The SIMPLIFIED Plaque --- */}
                <div className="plaque">
                  <p className="plaque-artist">Justin Guo & Emily Zhang</p>
                  <p className="plaque-title">
                    <em>Portrait of You (Version {viewedPortrait.version})</em>, {currentYear}
                  </p>
                  <p className="plaque-medium">Digital, AI Generation</p>
                  <br />
                  <p className="plaque-description">
                    This piece is a dynamic reflection of the artist's digital self. The portrait degrades over time based on unproductive screen time, serving as a visual metaphor for the unseen toll of digital distraction. 
                  </p>
                  <br />
                  <p className="plaque-description">The last decay was caused by: "{viewedPortrait.promptEffectText}"</p>
                </div>
              </div>
            ) : (
              <div className="text-center p-8 border-2 border-dashed rounded-lg">
                <p>The portrait has not yet been created.</p>
              </div>
            )}
            
            {/* --- Stepper Controls Below --- */}
            {history.length > 1 && (
              <div className="stepper-controls">
                <button onClick={handleNewer} disabled={activeIndex === 0}>
                  ← Newer
                </button>
                <span className="stepper-status">
                  Version {viewedPortrait?.version} of {history[0]?.version}
                </span>
                <button onClick={handleOlder} disabled={activeIndex === history.length - 1}>
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