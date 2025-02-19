import express from "express";
import path from "path"
const app = express();
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import axios from "axios";
import mongoose from "mongoose";
import 'dotenv/config.js';
import { ObjectId } from "mongodb";
import Student from "./models/Student.js"


import OpenAI from "openai";
const openai = new OpenAI({
  apiKey: "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", // Replace with your OpenAI API key
});

// Middleware to parse JSON
app.use(express.json());

app.use(cors());

app.use(bodyParser.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log('MongoDB Connection Error:', err, process.env.MONGO_URI));


// API route example
app.get('/api', (req, res) => {
  res.json({ message: 'Hello from Express!' });
});

// ✅ Route to fetch completed questions for a student
app.get('/api/student-progress/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ error: "Invalid student ID" });
    }

    const db = mongoose.connection.useDb('FOW');
    const studentsCollection = db.collection('students');

    const student = await studentsCollection.findOne({ _id: new ObjectId(studentId) });

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    res.json(student.completedQuestions || []); // Return completed questions or an empty array
  } catch (error) {
    console.error("Error fetching student progress:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Route to update completed questions
app.post('/api/student-progress', async (req, res) => {
  try {
    const { studentId, moduleId, questionId, isChecked } = req.body;

    if (!studentId || moduleId === undefined || questionId === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const db = mongoose.connection.useDb('FOW');
    const studentsCollection = db.collection('students');

    const student = await studentsCollection.findOne({ _id: new ObjectId(studentId) });

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    let completedQuestions = student.completedQuestions || [];

    if (isChecked) {
      // Add question if not already in the list
      if (!completedQuestions.some(q => q.moduleId === moduleId && q.questionId === questionId)) {
        completedQuestions.push({ moduleId, questionId });
      }
    } else {
      // Remove question from completed list
      completedQuestions = completedQuestions.filter(
        q => !(q.moduleId === moduleId && q.questionId === questionId)
      );
    }

    await studentsCollection.updateOne(
      { _id: new ObjectId(studentId) },
      { $set: { completedQuestions } }
    );

    res.json({ success: true, completedQuestions });
  } catch (error) {
    console.error("Error updating student progress:", error);
    res.status(500).json({ error: "Server error" });
  }
});


app.get('/api/student/:id', async (req, res) => {
  console.log("Tried fetching name for ID:", req.params.id);

  try {
    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid student ID" });
    }

    const db = mongoose.connection.useDb('FOW');
    const studentsCollection = db.collection('students');

    const student = await studentsCollection.findOne(
      { _id: new ObjectId(req.params.id) }
    );
    // Find student by ID

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    res.json({
      name: student.name,
      type: student.type,
      preTestScores: student.preTestScores,
      postTestScores: student.postTestScores,
      conversationHistory: student.conversationHistory
    });
  } catch (error) {
    console.error("Error fetching student:", error);
    res.status(500).json({ error: "Server error" });
  }
});


app.post('/api/storeConversation', async (req, res) => {
  try {
    const { studentId, conversationData } = req.body;

    if (!studentId || !conversationData) {
      return res.status(400).json({ message: "Invalid data" });
    }

    const db = mongoose.connection.useDb('FOW');
    const studentsCollection = db.collection('students');

    await studentsCollection.updateOne(
      { _id: new ObjectId(studentId) },
      { $push: { conversationHistory: conversationData } }
    );

    res.json({ message: "Conversation history saved successfully." });
  } catch (error) {
    console.error("Error saving conversation history:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// app.post('/api/storeConversation', async (req, res) => {
//   try {
//     const { id, conversationData } = req.body;

//     if (!id || !conversationData || !conversationData.date || !conversationData.message) {
//       return res.status(400).json({ message: "Invalid data" });
//     }

//     const student = await Student.findById(id);

//     if (!student) {
//       return res.status(404).json({ error: "Student not found" });
//     }

//     // Find if the date already exists
//     let existingEntry = student.conversationHistory.find(entry => entry[conversationData.date]);

//     if (existingEntry) {
//       // Append message if date exists
//       existingEntry[conversationData.date].push(conversationData.message);
//     } else {
//       // Create a new date entry
//       student.conversationHistory.push({
//         [conversationData.date]: [conversationData.message]
//       });
//     }

//     await student.save();
//     res.json({ message: "✅ Conversation history updated successfully." });

//   } catch (error) {
//     console.error("❌ Error saving conversation history:", error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// });


app.post('/api/login', async (req, res) => {
  console.log("Made a call to the login api")
  try {
    const { rollNumber } = req.body;

    if (!rollNumber) {
      return res.status(400).json({ message: 'Unique ID is required' });
    }

    const db = mongoose.connection.useDb('FOW');
    const studentsCollection = db.collection('students');
    const user = await studentsCollection.findOne({ rollNumber });

    if (!user) {
      return res.status(401).json({ message: 'Invalid Unique ID' });
    }

    res.json({ message: 'Login successful', user });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
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

app.post("/api/debug", async (req, res) => {
  const { problemStatement, templateCode, userAnswers, correctAnswers } = req.body;

  if (!problemStatement || !templateCode || !userAnswers || !correctAnswers) {
    return res
      .status(400)
      .json({ error: "problemStatement, templateCode, userAnswers, and correctAnswers are required." });
  }


  let wrongAnswerIndex = -1;
  for (let i = 0; i < correctAnswers.length; i++) {
    if (userAnswers[i] !== correctAnswers[i]) {
      wrongAnswerIndex = i;
      break;
    }
  }

  // If all answers are correct
  if (wrongAnswerIndex === -1) {
    return res.status(200).json({ suggestion: "All answers are correct! Great job!" });
  }

  const wrongAnswer = userAnswers[wrongAnswerIndex];
  const correctAnswer = correctAnswers[wrongAnswerIndex];

  // Construct the prompt
  const prompt = `
The user is solving a Java programming problem. Below is the problem statement and the code template provided to the user:

Problem Statement:
${problemStatement}

Template Code:
${templateCode}

The user's answer for blank #${wrongAnswerIndex + 1} is "${wrongAnswer}".
The correct answer for blank #${wrongAnswerIndex + 1} is "${correctAnswer}".

Explain why the user's answer is incorrect and provide guidance to help the user arrive at the correct answer. Focus ONLY on blank #${wrongAnswerIndex + 1}. Keep your feedback concise and clear.
`;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a helpful assistant for debugging Java code." },
        { role: "user", content: prompt },
      ],
    });

    const suggestion = completion.choices[0].message.content;

    // Send feedback about the specific blank
    res.status(200).json({ suggestion });
  } catch (error) {
    console.error("Error with OpenAI API:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch debugging suggestions." });
  }
});

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;

  if (!messages) {
    return res.status(400).json({ error: "Messages are required." });
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages,
    });

    const reply = response.choices[0].message.content;
    res.status(200).json({ response: reply });
  } catch (error) {
    console.error("Error with ChatGPT API:", error.message);
    res.status(500).json({ error: "Failed to fetch response from ChatGPT." });
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
