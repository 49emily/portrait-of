# MVP flow for image gen

## Env

Create `backend/.env`:

```env
GEMINI_API_KEY=your_api_key_here
```

## Run

From project root:

```bash
node backend/routes/worker.js
```

What happens:

- Scheduler runs `backend/routes/generateNano.js` on a 60s interval (until you stop it).
- **First run** uses `backend/images/justin_base.png` as input and an oil-painting prompt.
- **Subsequent runs** use the latest image in `backend/out/` as input.
- Each run picks **one random prompt** from `backend/prompts.json`.
- Sends image + prompt to `gemini-2.5-flash-image-preview`.
- Saves a new image as `backend/out/dorian_v###.png` and appends to `backend/out/manifest.json`.
- Console logs show run details for debugging.

> Change the interval in `backend/routes/worker.js` (the `60_000` ms).

## Reset

To start from v001 and the base image again:

```bash
rm -rf backend/out/*
```

(Deletes both images and `manifest.json`.)

## Questions / Future Steps

- **RescueTime integration**
  - **Simplest rule**:
    - Fetch total _bad time_ for the last hour/day/etc.
    - If `badTime > threshold`, run one prompt.
  - **Options**:
    - **Multiple thresholds** → escalate prompt severity based on bad time (e.g., 15m = light cracks, 30m = larger tears, 60m+ = major damage).
    - **Stacking** → for very high bad time, apply multiple prompts in one run.
  - How much do we care about specific website breakdowns?
