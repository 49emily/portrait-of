# MVP flow for image generation + RescueTime

## Env

Create `backend/.env`:

```env
GEMINI_API_KEY=your_api_key_here
RESCUETIME_API_KEY=your_api_key_here
```

## Run

From project root:

```bash
node backend/routes/worker.js
```

What happens:

- Scheduler runs `backend/routes/generateNano.js` on a 60s interval (until you stop it).
    - > Change the interval in `backend/routes/worker.js` (the `60_000` ms).
- Fetches last hour (or whatever interval we set) of activity from RescueTime API and **calculates total unproductive time** 
    - Note: we should make sure to categorize applications and websites RescueTime doesn't automatically categorize. I noticed that it classified a lot of my applications as Uncategorized, which set the productivity score to 0. 
- If productivity gate is enabled, it compares unproductive time to set threshold. 
- If ```unproductive time > threshold```, script picks **one random prompt** from `backend/prompts.json` and sends image + prompt to `gemini-2.5-flash-image-preview`. 
    - If ```unproductive time < threshold```, nothing happens. 
- It then saves a new image as `backend/out/dorian_v###.png` and appends to `backend/out/manifest.json`.
- **First run** uses `backend/images/justin_base.png` as input and an oil-painting prompt.
- **Subsequent runs** use the latest image in `backend/out/` as input.
- Console logs show run details for debugging.

## Rescuetime

```const GATING_ENABLED = true; // toggle for rescuetime productivty gate``` 

```const UNPRODUCTIVE_THRESHOLD_MINUTES = 5; // Trigger if unproductive time is >= 10 minutes```

```const ACTIVITY_CHECK_WINDOW_MS = 60 * 60 * 1000;```

## Reset

To start from v001 and the base image again:

```bash
rm -rf backend/out/*
```

(Deletes both images and `manifest.json`.)