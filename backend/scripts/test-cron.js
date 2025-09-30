// Simple test script for the cron job
import cronHandler from "../api/cron.js";

// Mock request and response objects
const mockReq = {
  headers: {
    authorization: `Bearer ${process.env.CRON_SECRET || "test"}`,
  },
};

const mockRes = {
  status: (code) => ({
    json: (data) => {
      console.log(`Status: ${code}`);
      console.log("Response:", JSON.stringify(data, null, 2));
      return mockRes;
    },
  }),
  json: (data) => {
    console.log("Response:", JSON.stringify(data, null, 2));
    return mockRes;
  },
};

console.log("Testing cron job endpoint...");
cronHandler(mockReq, mockRes).catch(console.error);
