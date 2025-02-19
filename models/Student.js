import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    sender: { type: String, required: true }, // "bot" or "user"
    text: { type: String, required: true }   // Message text
});

// Conversation history stored as an array of objects where the key is a date
const conversationEntrySchema = new mongoose.Schema({}, { strict: false });

const studentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    rollNumber: { type: String, required: true, unique: true }, // Unique Roll Number
    type: { type: String, required: true },
    preTestScores: { type: String, default: "" }, // Pre-test scores
    postTestScores: { type: String, default: "" }, // Post-test scores
    conversationHistory: { type: [conversationEntrySchema], default: [] } // History stored as objects with date keys
});

const Student = mongoose.model("Student", studentSchema);
export default Student;
