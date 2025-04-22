// This file handles specific Vercel serverless deployment
// It ensures that all routes are properly forwarded to our main server.js

// Import the Express app from the main server file
const app = require('../server');

// Export the Express app for Vercel
module.exports = app;