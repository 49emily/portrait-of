import { useState } from "react";
import "./App.css";

function App() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState(null);
  const [activities, setActivities] = useState([]);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState(null);

  const handleStartGeneration = async () => {
    setIsGenerating(true);
    setError(null);
    setGeneratedImage(null);

    try {
      const response = await fetch("http://localhost:3000/api/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (data.success) {
        setGeneratedImage(data.imageUrl);
        setActivities(data.activities);
        setTimeRange(data.timeRange);
      } else {
        setError(data.error || "Failed to generate image");
      }
    } catch (err) {
      setError("Network error: " + err.message);
    } finally {
      setIsGenerating(false);
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
            <button
              onClick={handleStartGeneration}
              disabled={isGenerating}
              className="block mx-auto mb-12 py-4 px-8 text-lg font-semibold rounded-lg disabled:opacity-50 bg-gray-100 hover:bg-gray-200"
            >
              {isGenerating ? "Generating..." : "Start Generation"}
            </button>

            {error && (
              <div className="p-4 mb-12 text-center">
                <h3 className="font-bold mb-2">❌ Error</h3>
                <p>{error}</p>
              </div>
            )}

            {timeRange && (
              <div className="text-center mb-12 p-4">
                <p>
                  <strong>Time Range:</strong> {new Date(timeRange.from).toLocaleTimeString()} -{" "}
                  {new Date(timeRange.to).toLocaleTimeString()}
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
