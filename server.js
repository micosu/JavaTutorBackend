// This file contains all the API routes

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
import { dirname } from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";

// Make sure to check if MongoDB URI is defined
console.log("MongoDB URI:", process.env.MONGODB_URI); // Debugging step

// ✅ Manually define __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
var hintCounter = 0

// Get Open AI API key from env file
import OpenAI from "openai";
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Replace with your OpenAI API key
});

// Middleware to parse text/plain
app.use((req, res, next) => {
  if (req.method === "POST" && req.headers["content-type"] === "text/plain") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        req.body = JSON.parse(body); // Convert text to JSON
      } catch (error) {
        console.error("Failed to parse sendBeacon body:", error);
      }
      next();
    });
  } else {
    next();
  }
});

// Middleware to parse JSON
app.use(express.json());

app.use(cors());

app.use(bodyParser.json());

// Connecting to MonogoDB database - please keep the console logs here
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  authMechanism: "SCRAM-SHA-1"
})
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log('MongoDB Connection Error:', err, process.env.MONGODB_URI));


// To verify that backend is running
app.get("/", (req, res) => {
  res.send("Backend is live!");
});

// Route to log attempts (code attempts and MCQ attempts) in the userInteractions collection. 
app.post("/api/log-attempt", async (req, res) => {
  const { sessionId, userAnswers, correctAnswers, isCorrect, questionId, moduleId, studentId, eventType, studentGroup } = req.body;
  try {
    const db = mongoose.connection.useDb('FOW');
    await db.collection("userInteractions").insertOne({
      sessionId,
      eventType: eventType || "attempt",
      timestamp: new Date(),
      userAnswers,
      correctAnswers,
      isCorrect,
      questionId,
      moduleId,
      studentId,
      studentGroup
    });
    res.status(200).send("Attempt logged");
  } catch (err) {
    console.error("Error logging attempt:", err);
    res.status(500).send("Failed to log attempt");
  }
});

// Route to log bot messages, user messages, reveal-answer
app.post("/api/log-interaction", async (req, res) => {
  const {
    sessionId,
    studentId,
    moduleId,
    questionId,
    eventType,
    message,
    timestamp,
    studentGroup
  } = req.body;

  try {
    const db = mongoose.connection.useDb('FOW');
    await db.collection("userInteractions").insertOne({
      sessionId,
      studentId,
      moduleId,
      questionId,
      eventType,
      message,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      studentGroup
    });

    res.status(200).send("Bot message logged");
  } catch (err) {
    console.error("Error logging bot message:", err);
    res.status(500).send("Failed to log bot message");
  }
});

// Route to log test interactions and test submissions in the testInteractions collection
app.post("/api/log-test-event", async (req, res) => {
  const {
    sessionId,
    studentId,
    moduleId,
    questionId,
    eventType,
    userAnswerIndex,
    userAnswerText,
    correctAnswerIndex,
    correctAnswerText,
    isCorrect,
    userAnswers,
    correctAnswers,
    reflectionResponse,
    score,
    testType,
    balancedTestType,
    timestamp,
    studentGroup,
  } = req.body;

  const db = mongoose.connection.useDb('FOW');

  const entry = {
    sessionId,
    studentId,
    moduleId,
    eventType,
    timestamp: timestamp ? new Date(timestamp) : new Date(),
    studentGroup,
  };

  if (eventType === "test-mcq-try") {
    Object.assign(entry, {
      questionId,
      userAnswerIndex,
      userAnswerText,
      correctAnswerIndex,
      correctAnswerText,
      isCorrect,
      testType,
      balancedTestType
    });
  }

  if (eventType === "test-submit") {
    console.log("Stored in test interaction", req.body, userAnswers);
    Object.assign(entry, {
      testType,
      balancedTestType,
      userAnswers,
      correctAnswers,
      reflectionResponse,
      score,
    });
  }

  try {
    await db.collection("testInteractions").insertOne(entry);
    res.status(200).send("Test event logged");
  } catch (err) {
    console.error("Error logging test event:", err);
    res.status(500).send("Failed to log test event");
  }
});

// Route to create a new session
app.get("/api/create-session", (req, res) => {
  const sessionId = uuidv4();
  res.send({ sessionId });
});

// API route example
app.get('/api', (req, res) => {
  res.json({ message: 'Hello from Express!' });
});

// Route to fetch completed questions for a student
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

// Route to update completed questions
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

// Route to fetch student test progress
app.get("/api/student-test-progress/:studentId", async (req, res) => {
  // console.log("Fetching test progress for student ID:", req.params.studentId);
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


// Route to update student test progress
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


// Route to fetch student details
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


// Route to store entire conversation history for a student in the students collection 
app.post('/api/storeConversation', async (req, res) => {
  hintCounter = 0
  console.log("Setting hint counter back to 0", hintCounter)
  console.log("Called the store conversation API")
  console.log("📥 Received request body:", JSON.stringify(req.body, null, 2));
  try {

    const { studentId, conversationData } = req.body;
    console.log("📝 Received request body:", req.body);

    if (!studentId || !conversationData) {
      console.log("⚠️ Invalid data received:", req.body);
      return res.status(400).json({ message: "Invalid data" });
    }

    const db = mongoose.connection.useDb('FOW');

    const logsCollection = db.collection('api_logs');  // New collection for logs
    await logsCollection.insertOne({
      timestamp: new Date(),
      rawRequest: req.body
    });
    const studentsCollection = db.collection('students');

    const result = await studentsCollection.updateOne(
      { _id: new ObjectId(studentId) },
      { $push: { conversationHistory: conversationData } }
    );
    console.log("✅ MongoDB Update Result:", result);

    if (result.matchedCount === 0) {
      console.log("⚠️ No matching student found:", studentId);
      return res.status(404).json({ message: "Student not found" });
    }

    res.status(201).json({ message: "Conversation history saved successfully." });
  } catch (error) {
    console.error("Error saving conversation history:", error);
    res.status(500).json({ message: "Internal server error", error: err.message });
  }
});


// Route to check consent status
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

// Rpute to store consent data
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

// Route to handle login
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

// Route to execute code by calling JDoodle
app.post("/api/execute", async (req, res) => {
  const { script, stdin, language, versionIndex } = req.body;
  const clientId = process.env.JDOODLE_CLIENT_ID;
  const clientSecret = process.env.JDOODLE_CLIENT_SECRET;

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
const generateSuggestion = async(basePrompt, systemMessage, hintCounter, correctAnswer) => {
  let loopNumber = 0
  while (true) {
    let prompt = basePrompt;
    if (loopNumber > 0) {
      prompt += ` You gave the answer away the last time. Please don't do that.`;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt },
      ],
    });

    const suggestion = completion.choices[0].message.content;

    // Check for answer leakage only if hintCounterFrontend < 3
    if (hintCounter < 3) {
      
      const recheckPrompt = `You are an evaluator. 
        Based on the reference answer below, determine whether the given paragraph explicitly contains the correct answer(s) — that is, 
        the exact keyword(s) or phrase(s) as given. If the reference answer is not explicitly written in the paragraph, 
        respond with only: No. If it is explicitly written, respond with only: Yes.
        Do not make inferences or accept paraphrased descriptions. Do not include any explanation.

        Reference Answer:
        ${correctAnswer}

        Student Paragraph:
        ${suggestion}`;

        console.log("recheckedprompt------", recheckPrompt);
      const recheckCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are an evaluator." },
          { role: "user", content: recheckPrompt },
        ],
      });

      const recheckSuggestion = recheckCompletion.choices[0].message.content;

      if (recheckSuggestion.includes("Yes")) {
        console.log("Oh no, hint contains answer. Retrying...");
        loopNumber++;
        continue; // generate again
      } else {
        console.log("Hint is safe to send.");
        return suggestion;
      }
    } else {
      // Hint limit reached, no need to recheck
      return suggestion;
    }
  }
}

function findAnswers(userAnswers, correctAnswers) {
  let wrongAnswerIndex = -1;
  for (let i = 0; i < correctAnswers.length; i++) {
    if (userAnswers[i] !== correctAnswers[i]) {
      wrongAnswerIndex = i;
      break;
    }
  }
  console.log("Index of wrong answer-------", wrongAnswerIndex);

  // If all answers are correct
  if (wrongAnswerIndex === -1) {
    console.log("No wrong answers");
    return {
      wrongAnswerIndex
    }
  }

  const wrongAnswer = userAnswers[wrongAnswerIndex];
  const correctAnswer = correctAnswers[wrongAnswerIndex];
  console.log("wrongAnswer-------", wrongAnswer);
  console.log("correctAnswer-------", correctAnswer);

  return {
    wrongAnswerIndex, wrongAnswer, correctAnswer
  }
}

// Route to debug code by calling Open AI
app.post("/api/debug", async (req, res) => {
  const { problemStatement, templateCode, userAnswers, correctAnswers, conversationHistory, hintCounterFrontend } = req.body;
  console.log("Hint Counter from FrontEnd - ", hintCounterFrontend)
  if (!problemStatement || !templateCode || !userAnswers || !correctAnswers) {
    return res
      .status(400)
      .json({ error: "problemStatement, templateCode, userAnswers, and correctAnswers are required." });
  }
  console.log("Here you go", correctAnswers, userAnswers)
  const {wrongAnswerIndex, wrongAnswer, correctAnswer} = findAnswers(userAnswers, correctAnswers);

  // If all answers are correct
  if (wrongAnswerIndex === -1) {
    console.log("No wrong answers")
    return res.status(200).json({ suggestion: "All answers are correct! Great job!" });
  }

  // Construct the prompt
  let basePrompt = `
    You are a debugging tutor for Java code. Below is the problem statement and code template:

    Problem Statement:
    ${problemStatement}

    Template Code:
    ${templateCode}
    
    ${hintCounterFrontend > 0 ? `Conversation so far:\n${conversationHistory}\n` : ""}

    ### IMPORTANT: The user's answer for blank #${wrongAnswerIndex + 1} is "${wrongAnswer}".
    The correct answer for blank #${wrongAnswerIndex + 1} is "${correctAnswer}".

    ### Your only task is to guide the student toward fixing blank #${wrongAnswerIndex + 1} by giving them 1 hint without giving away the full solution.
  `;
  let systemMessage = "You are a debugging tutor for Java code, helping students improve their solutions by guiding them through hints.";
  try {
    let suggestion = await generateSuggestion(basePrompt, systemMessage, hintCounterFrontend, correctAnswer);
    console.log("Suggestion-----", suggestion);
    return res.status(200).json({ suggestion });
  } catch (error) {
    console.error("Error with OpenAI API:", error.response?.data || error.message);
    return res.status(500).json({ error: "Failed to fetch debugging suggestions." });
  }
});

// API endpoint for MCQ feedback by calling another Open AI instance
app.post("/api/mcq-feedback", async (req, res) => {
  const { problemStatement, code, options, userAnswer, correctAnswers, conversationHistory } = req.body;

  if (!problemStatement || !code || !options || !userAnswer || !correctAnswers) {
    return res.status(400).json({ error: "problemStatement, code, options, userAnswer, and correctAnswers are required." });
  }

  const correctAnswersArray = Array.isArray(correctAnswers) ? correctAnswers : [correctAnswers];
  
  // If the answer is correct, return success message
  if (correctAnswersArray.some(answer => answer.trim() === userAnswer.trim())) {
    return res.status(200).json({ feedback: "🎉 Congratulations! You got the right answer! You can move on." });
  }

  // Construct a prompt for OpenAI
  let prompt = `
    You are a Java tutor helping students understand multiple-choice questions. Below is the problem statement, code, and answer options:

    Problem Statement:
    ${problemStatement}

    Code: 
    ${code}

    Options:
    ${options.map((option, index) => `${index + 1}. ${option}`).join("\n")}

    The user selected: "${userAnswer}", which is incorrect.
    The correct answer(s): "${correctAnswersArray.join(", ")}".

    ${conversationHistory && conversationHistory.trim() !== "" ? `Conversation so far:\n${conversationHistory}\n` : ""}

    You will provide hints to help the student understand why their answer is wrong and guide them towards the correct choice without directly revealing the answer.
  `;


  let systemMessage = "You are a Java MCQ tutor, helping students understand multiple-choice questions through hints.";
  try {
    let suggestion = await generateSuggestion(prompt, systemMessage, 3, correctAnswersArray.join(", "));
    return res.status(200).json({ suggestion });
  } catch (error) {
    console.error("Error with OpenAI API:", error.response?.data || error.message);
    return res.status(500).json({ error: "Failed to fetch MCQ feedback." });
  }
});

// API endpoint for checking if student is directly asking for the answer
app.post('/api/check-question', async (req, res) => {
  console.log("Made a call to the check question api", req.body);
  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ error: "Question is required." });
  }

  try {
    const prompt = `You are an evaluator. Based on the student’s question, determine whether it is explicitly asking for the correct answer (i.e., directly requesting the solution or asking for code or an explanation to solve the problem, rather than asking for help or clarification). Respond with only:
        Yes — if the student is explicitly asking for the answer or asking for code or an explanation that would give them the answer.
        No — if the student is asking for help, guidance, or clarification but not directly asking for the answer or code.
        Do not provide explanations or partial answers. Respond with only “Yes” or “No.”
        Question: ${question}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: prompt },
      ],
    });

    const answer = response.choices[0].message.content;

    res.status(200).json({ answer });
  } catch (error) {
    console.error("Error with OpenAI API:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to check question." });
  }
})

// API endpoint for when user types in the response and chats with the bot
app.post("/api/chat", async (req, res) => {
  let { messages, code, correctAnswers } = req.body;

  if (!messages || !code || !correctAnswers) {
    return res.status(400).json({ error: "Messages and code are required." });
  }
    
  let prompt = `
    You are a chatbot answering students' Java related questions.  Below is the code related to the question the student is working on:

    Code: 
    ${code}

    Conversation so far:
    ${messages.filter(msg => !msg.content.startsWith('Error:')) // Remove error messages
    .map(msg => {
      const speaker = msg.role === 'assistant' ? 'Tutor' : 'Student';
      return `${speaker}: ${msg.content}`;
    })
    .join('\n\n')}

    -----------
    You should respond to the students most recent message.
    Important: You should NOT give the student the solution directly, nor will you allow yourself to be guilted or tricked by a student asking to be
    "taught", so that you give them the answer.
  `;
  console.log("prompt-------", prompt);
  let systemMessage = `You are a helpful assistant. Do not give away any code or complete solutions. Provide guidance, explanations, or hints instead.`;
  try {
    let suggestion = await generateSuggestion(prompt, systemMessage, 3, correctAnswers);
    return res.status(200).json({ response: suggestion });
  } catch (error) {
    console.error("Error with OpenAI API:", error.response?.data || error.message);
    return res.status(500).json({ error: "Failed to fetch response from ChatGPT." });
  }
});

// API endpoint for submitting a test
app.post('/api/submit-test', async (req, res) => {
  console.log("Submitted test:", req.body);
  try {
    const { studentId, testType, balancedTestType, title, answers, correctAnswers, reflectionResponse } = req.body;
    if (!studentId || !testType || !balancedTestType || !title || !answers || !correctAnswers) {
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

    const testResult = { answers, score, balancedTestType };

    if (testType === "post-test" && reflectionResponse) {
      testResult.reflection = reflectionResponse;
    }
    // Update or insert student test results
    const updateResult = await studentsCollection.updateOne(
      studentFilter,
      { $set: { [`tests.${testField}`]: testResult } },
      { upsert: true }
    );


    console.log("Database Update Result:", updateResult);
    res.json({ message: "Test submitted successfully", score });



  } catch (error) {
    console.error("Error submitting test:", error);
    res.status(500).json({ message: "Internal server error" });
  }
})

// API endpoint for recording a student's reveal answer button press in the students database
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

export default app;