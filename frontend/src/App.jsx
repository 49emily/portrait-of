import { useState } from "react";
import "./App.css";

function App() {
  const [isFetchingActivities, setIsFetchingActivities] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImage, setGeneratedImage] = useState(null);
  const [activities, setActivities] = useState([]);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState(null);
  const [summary, setSummary] = useState(null);

  const handleFetchActivities = async () => {
    setIsFetchingActivities(true);
    setError(null);
    setActivities([]);
    setGeneratedImage(null);

    try {
      const response = await fetch("http://localhost:3000/api/activity/past-hour");
      const data = await response.json();

      if (data.success) {
        // setActivities(data.activities);
        //todo: change for testing only
        setActivities([
          {
            activity: "Obsidian",
            category: "Writing Software",
            totalTimeMinutes: 10,
            productivity: 1,
          },
          {
            activity: "Notion",
            category: "Writing Software",
            totalTimeMinutes: 10,
            productivity: 1,
          },
        ]);
        setTimeRange(data.timeRange);
        setSummary(data.summary);
      } else {
        setError(data.error || "Failed to fetch activities");
      }
    } catch (err) {
      setError("Network error: " + err.message);
    } finally {
      setIsFetchingActivities(false);
    }
  };

  const handleGenerateImage = async () => {
    if (activities.length === 0) {
      setError("No activities to generate image from");
      return;
    }

    setIsGeneratingImage(true);
    setError(null);

    try {
      const response = await fetch("http://localhost:3000/api/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ activities }),
      });

      const data = await response.json();

      if (data.success) {
        setGeneratedImage(data.imageUrl);
      } else {
        setError(data.error || "Failed to generate image");
      }
    } catch (err) {
      setError("Network error: " + err.message);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start p-8">
      <div className="w-full max-w-4xl">
        <header className="text-center mb-12">
          <h1 className="text-4xl mb-2">Activity Image Generator</h1>
          <p className="text-lg">Generate AI artwork based on your past hour's digital activity</p>
        </header>

        <main className="flex justify-center">
          <div className="w-full max-w-2xl">
            <div className="flex flex-col items-center space-y-4 mb-12">
              <button
                onClick={handleFetchActivities}
                disabled={isFetchingActivities}
                className="py-4 px-8 text-lg font-semibold rounded-lg disabled:opacity-50 bg-gray-100 hover:bg-gray-200"
              >
                {isFetchingActivities ? "📊 Fetching Activities..." : "📊 Fetch Activities"}
              </button>

              {activities.length > 0 && (
                <button
                  onClick={handleGenerateImage}
                  disabled={isGeneratingImage}
                  className="py-4 px-8 text-lg font-semibold rounded-lg disabled:opacity-50 bg-gray-100 hover:bg-gray-200"
                >
                  {isGeneratingImage ? "🎨 Generating Image..." : "🎨 Generate Image"}
                </button>
              )}
            </div>

            {error && (
              <div className="p-4 mb-12 text-center">
                <h3 className="font-bold mb-2">❌ Error</h3>
                <p>{error}</p>
              </div>
            )}

            {timeRange && summary && (
              <div className="text-center mb-12 p-4">
                <p className="mb-2">
                  <strong>Time Range:</strong> {new Date(timeRange.from).toLocaleTimeString()} -{" "}
                  {new Date(timeRange.to).toLocaleTimeString()}
                </p>
                <p>
                  <strong>Total Time:</strong> {summary.totalTimeMinutes} minutes |{" "}
                  <strong>Activities:</strong> {summary.totalActivities}
                </p>
              </div>
            )}

            {activities.length > 0 && (
              <div className="mb-12">
                <h3 className="text-center text-xl font-bold mb-6">
                  📊 Top Activities (Past Hour)
                </h3>
                <div className="space-y-4">
                  {activities.map((activity, index) => (
                    <div key={index} className="flex justify-between items-center p-4">
                      <span className="font-semibold">{activity.activity}</span>
                      <span className="text-sm">({activity.category})</span>
                      <span className="font-semibold">{activity.totalTimeMinutes}m</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {generatedImage && (
              <div className="text-center">
                <h3 className="text-xl font-bold mb-4">🖼️ Generated Image</h3>
                <div className="flex justify-center">
                  <img
                    src={generatedImage}
                    alt="Generated artwork based on your activities"
                    className="max-w-full h-auto rounded-lg"
                  />
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
