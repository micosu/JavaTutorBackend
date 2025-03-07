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
  apiKey: process.env.OPENAI_API_KEY, // Replace with your OpenAI API key
});

console.log(process.env.OPENAI_API_KEY)
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

app.get("/api/student-test-progress/:studentId", async (req, res) => {
  console.log("Fetching test progress for student ID:", req.params.studentId);
  try {
    const { studentId } = req.params;
    const db = mongoose.connection.useDb('FOW');
    const studentCollection = db.collection("students");

    // Ensure we handle ObjectId correctly
    const studentFilter = ObjectId.isValid(studentId) ? { _id: new ObjectId(studentId) } : { studentId };

    // Retrieve student test progress
    const studentData = await studentCollection.findOne(studentFilter);

    if (!studentData) {
      return res.json({ message: "No progress found", tests: {} });
    }

    res.json({ tests: studentData.tests || {} }); // Return tests field
  } catch (error) {
    console.error("Error fetching student progress:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});


app.post("/api/student-test-progress", async (req, res) => {
  try {
    const { studentId, moduleId, testType, isChecked } = req.body;
    const studentCollection = db.collection("students");

    const testField = `${testType}-${moduleId}`;

    const studentFilter = ObjectId.isValid(studentId) ? { _id: new ObjectId(studentId) } : { studentId };
    // Update student progress
    const updateResult = await studentCollection.updateOne(
      studentFilter,
      { $set: { [`tests.${testField}.completed`]: isChecked } },
      { upsert: true }
    );

    res.json({ message: "Progress updated successfully", updateResult });

  } catch (error) {
    console.error("Error updating student progress:", error);
    res.status(500).json({ message: "Internal server error" });
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
  console.log("Called the store conversation API")
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

app.get('/api/checkConsent/:studentId', async (req, res) => {
  console.log("Called the check consent API");
  try {
    const studentId = req.params.studentId;
    if (!studentId) {
      return res.status(400).json({ message: "Student Id required" });
    }

    const db = mongoose.connection.useDb('FOW');
    const studentsCollection = db.collection('students');

    const student = await studentsCollection.findOne({ _id: new ObjectId(studentId) });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const hasConsent = student.consentForm === "True";
    res.json({ hasConsent });

  } catch (error) {
    console.error("Error checking consent status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post('/api/storeConsent', async (req, res) => {
  console.log("Called the store consent API")
  try {
    const { studentId, age, understand, participate, eligible } = req.body;

    if (!studentId || !age || !understand || !participate) {
      return res.status(400).json({ message: "Invalid data" });
    }

    const db = mongoose.connection.useDb('FOW');
    const studentsCollection = db.collection('students');

    const result = await studentsCollection.updateOne(
      { _id: new ObjectId(studentId) }, // Use the correct studentId
      {
        $set: {
          consentForm: "True", // Mark as filled
          consentData: {
            age,
            understand,
            participate,
            eligible,
            timestamp: new Date(),
          },
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Student ID not found." });
    }

    res.json({ message: "Consent form data saved successfully." });
  } catch (error) {
    console.error("Error saving consent form data:", error);
    res.status(500).json({ message: "Internal server error" });;
  }
})

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
  const { problemStatement, templateCode, userAnswers, correctAnswers, conversationHistory } = req.body;

  if (!problemStatement || !templateCode || !userAnswers || !correctAnswers) {
    return res
      .status(400)
      .json({ error: "problemStatement, templateCode, userAnswers, and correctAnswers are required." });
  }
  console.log("Here you go", correctAnswers, userAnswers)

  let wrongAnswerIndex = -1;
  for (let i = 0; i < correctAnswers.length; i++) {
    if (userAnswers[i] !== correctAnswers[i]) {
      wrongAnswerIndex = i;
      break;
    }
  }

  // If all answers are correct
  if (wrongAnswerIndex === -1) {
    console.log("No wrong answers")
    return res.status(200).json({ suggestion: "All answers are correct! Great job!" });
  }

  const wrongAnswer = userAnswers[wrongAnswerIndex];
  const correctAnswer = correctAnswers[wrongAnswerIndex];

  // Construct the prompt
  let prompt = `
You are a debugging tutor for Java code. Below is the problem statement and code template:

Problem Statement:
${problemStatement}

Template Code:
${templateCode}

The user's answer for blank #${wrongAnswerIndex + 1} is "${wrongAnswer}".
The correct answer for blank #${wrongAnswerIndex + 1} is "${correctAnswer}".

You will provide hints one at a time without giving away the full solution.
`;

  if (conversationHistory && conversationHistory.trim() !== "") {
    prompt += `
The conversation so far:
${conversationHistory}

Based on the conversation above, please provide the next hint in sequence. Provide only one hint in your response.
`;
  } else {
    prompt += `
Please provide only the first hint.
`;
  }
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a debugging tutor for Java code, helping students improve their solutions by guiding them through hints." },
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

app.post("/api/mcq-feedback", async (req, res) => {
  const { problemStatement, options, userAnswer, correctAnswers, conversationHistory } = req.body;

  if (!problemStatement || !options || !userAnswer || !correctAnswers) {
    return res.status(400).json({ error: "problemStatement, options, userAnswer, and correctAnswers are required." });
  }

  console.log("User's Answer:", userAnswer);
  console.log("Correct Answers:", correctAnswers);

  const correctAnswersArray = Array.isArray(correctAnswers) ? correctAnswers : [correctAnswers];
  console.log("Correct Answers (processed as array):", correctAnswersArray);

  // If the answer is correct, return success message
  if (correctAnswersArray.some(answer => answer.trim() === userAnswer.trim())) {
    return res.status(200).json({ feedback: "🎉 Congratulations! You got the right answer! You can move on." });
  }

  // Construct a prompt for OpenAI
  let prompt = `
You are a Java tutor helping students understand multiple-choice questions. Below is the problem statement and answer options:

Problem Statement:
${problemStatement}

Options:
${options.map((option, index) => `${index + 1}. ${option}`).join("\n")}

The user selected: "${userAnswer}", which is incorrect.
The correct answer(s): "${correctAnswersArray.join(", ")}".

You will provide hints to help the student understand why their answer is wrong and guide them towards the correct choice without directly revealing the answer.
`;

  if (conversationHistory && conversationHistory.trim() !== "") {
    prompt += `
Previous conversation:
${conversationHistory}

Based on this conversation, please provide the next hint in sequence. Provide only **one hint** in your response.
`;
  } else {
    prompt += `
Please provide **only one hint** in your response.
`;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a Java MCQ tutor, helping students understand multiple-choice questions through hints." },
        { role: "user", content: prompt },
      ],
    });

    const feedback = completion.choices[0].message.content;

    res.status(200).json({ feedback });
  } catch (error) {
    console.error("Error with OpenAI API:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch MCQ feedback." });
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

app.post('/api/submit-test', async (req, res) => {
  console.log("Submitted test:", req.body);
  try {
    const { studentId, testType, title, answers, correctAnswers } = req.body;
    if (!studentId || !testType || !title || !answers || !correctAnswers) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const testField = `${testType}-${title}`;
    let score = 0;

    Object.keys(answers).forEach(qId => {
      if (answers[qId] == correctAnswers[qId]) { // Compare as string to avoid type mismatch
        score++;
      }
    });

    const db = mongoose.connection.useDb('FOW');
    const studentsCollection = db.collection('students');

    const studentFilter = ObjectId.isValid(studentId) ? { _id: new ObjectId(studentId) } : { studentId };

    // Update or insert student test results
    const updateResult = await studentsCollection.updateOne(
      studentFilter,
      { $set: { [`tests.${testField}`]: { answers, score } } },
      { upsert: true }
    );

    console.log("Database Update Result:", updateResult);
    res.json({ message: "Test submitted successfully", score });



  } catch (error) {
    console.error("Error submitting test:", error);
    res.status(500).json({ message: "Internal server error" });
  }
})

app.post('/api/reveal-answer', async (req, res) => {
  const { studentId, moduleId, questionId } = req.body;

  if (!studentId || !moduleId || !questionId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const db = mongoose.connection.useDb('FOW');
    const studentsCollection = db.collection('students');

    const newRevealEntry = { module: moduleId, question: questionId, timestamp: new Date() };

    const studentFilter = ObjectId.isValid(studentId) ? { _id: new ObjectId(studentId) } : { studentId };
    const updateResult = await studentsCollection.updateOne(
      studentFilter,
      { $push: { revealAnswers: newRevealEntry } }, // Adds to array (creates if it doesn't exist)
      { upsert: true } // Ensures revealAnswers field is created if missing
    );

    res.status(200).json({ message: "Reveal answer recorded successfully" });

  } catch (error) {
    console.error("Error updating student data:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }

})
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
