import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"; // ✅ Dynamic API URL

// ======================
// 🎥 Process Video
// ======================
export const processVideo = async (videoUrl) => {
  try {
    const response = await axios.post(`${API_BASE}/process-video`, { url: videoUrl });
    return response.data;
  } catch (error) {
    console.error("❌ Error processing video:", error);
    throw error;
  }
};

// ======================
// 📥 Download PDF
// ======================
export const downloadPDF = () => {
  window.open(`${API_BASE}/download-pdf`, "_blank");
};

// ======================
// 📥 Download Transcript
// ======================
export const downloadTranscript = () => {
  window.open(`${API_BASE}/download-transcript`, "_blank");
};

// ======================
// 📊 Fetch Analytics
// ======================
export const fetchAnalytics = async () => {
  try {
    const response = await axios.get(`${API_BASE}/analytics`);
    return response.data;
  } catch (error) {
    console.error("❌ Error fetching analytics:", error);
    throw error;
  }
};

// ======================
// 📤 Upload Transcript
// ======================
export const uploadTranscript = async (file) => {
  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await axios.post(`${API_BASE}/upload-transcript`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    return response.data;
  } catch (error) {
    console.error("❌ Error uploading transcript:", error);
    throw error;
  }
};

// ======================
// 📝 Summarize Transcript
// ======================
export const summarizeTranscript = async (file) => {
  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await axios.post(`${API_BASE}/summarize-transcript`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    return response.data;
  } catch (error) {
    console.error("❌ Error summarizing transcript:", error);
    throw error;
  }
};

// ======================
// 🎯 Generate Quiz
// ======================
export const generateQuiz = async (lectureText, difficulty = "medium", numQuestions = 5) => {
  try {
    const response = await axios.post(`${API_BASE}/generate-quiz`, {
      lecture_text: lectureText,
      difficulty,
      num_questions: numQuestions,
    });
    return response.data;
  } catch (error) {
    console.error("❌ Error generating quiz:", error);
    throw error;
  }
};

// ======================
// 🔄 Regenerate Summary
// ======================
export const regenerateSummary = async (language) => {
  try {
    const response = await axios.post(`${API_BASE}/generate-summary`, { language });
    return response.data;
  } catch (error) {
    console.error("❌ Error regenerating summary:", error);
    throw error;
  }
};

// ======================
// 🌐 Translate Summary
// ======================
export const translateSummary = async (summary, target) => {
  try {
    const response = await axios.post(`${API_BASE}/translate-summary`, {
      summary,
      target,
    });
    return response.data;
  } catch (error) {
    console.error("❌ Error translating summary:", error);
    throw error;
  }
};

// ======================
// 📊 Open Analytics Dashboard (Plotly)
// ======================
export const openAnalyticsDashboard = () => {
  window.open(`${API_BASE}/analytics-dashboard`, "_blank");
};
