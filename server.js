// server.js
// const express = require('express');
import express from "express";
// const path = require('path');
import path from "path"
const app = express();
// const cors = require('cors');
import cors from "cors";
// const bodyParser = require("body-parser");
import bodyParser from "body-parser";
// const fetch = require("node-fetch");
import fetch from "node-fetch";

// Middleware to parse JSON
app.use(express.json());

app.use(cors());

app.use(bodyParser.json());

// API route example
app.get('/api', (req, res) => {
  res.json({ message: 'Hello from Express!' });
});

app.post("/api/execute", async (req, res) => {
  const { clientId, clientSecret, script, stdin, language, versionIndex } = req.body;

  try {
    const response = await fetch("https://api.jdoodle.com/v1/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        clientSecret,
        script,
        stdin,
        language,
        versionIndex,
      }),
    });

    const data = await response.json();
    res.status(response.status).json(data); // Return the API response to the frontend
  } catch (error) {
    console.error("Error communicating with JDoodle API:", error);
    res.status(500).json({ error: "Failed to execute code" });
  }
});


// Serve React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
}

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
