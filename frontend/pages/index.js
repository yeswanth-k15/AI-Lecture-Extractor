import { useState, useEffect } from "react";
import { processVideo, generateQuiz, summarizeTranscript } from "../utils/api";
import { useRouter } from "next/router";
import Chart from "chart.js/auto";
import styles from "../styles/Home.module.css";

export default function Home() {
  const [url, setUrl] = useState("");
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [difficulty, setDifficulty] = useState("medium");
  const [questionCount, setQuestionCount] = useState(5);
  const [quizLoading, setQuizLoading] = useState(false);
  const [transcriptFile, setTranscriptFile] = useState(null);
  const [transcriptSummary, setTranscriptSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);

  // ✅ Language & Translation States
  const [translatedSummary, setTranslatedSummary] = useState("");
  const [detectedLanguage, setDetectedLanguage] = useState("en");
  const [languageMode, setLanguageMode] = useState("original");

  // ✅ Transcript Language States
  const [transcriptLangMode, setTranscriptLangMode] = useState("english");
  const [translatedTranscriptSummary, setTranslatedTranscriptSummary] = useState("");
  const [transcriptDetectedLang, setTranscriptDetectedLang] = useState("en");

  // ✅ Analytics states
  const [keywords, setKeywords] = useState([]);
  const [quizScores, setQuizScores] = useState([]);

  const router = useRouter();

  // ✅ Load saved data from localStorage on mount
  useEffect(() => {
    const savedResponse = localStorage.getItem("lectureResponse");
    const savedTranscript = localStorage.getItem("transcriptSummary");
    const savedQuizScores = localStorage.getItem("quizScores");
    const savedLanguage = localStorage.getItem("languageMode");

    if (savedResponse) setResponse(JSON.parse(savedResponse));
    if (savedTranscript) setTranscriptSummary(savedTranscript);
    if (savedQuizScores) setQuizScores(JSON.parse(savedQuizScores));
    if (savedLanguage) setLanguageMode(savedLanguage);
  }, []);

  // ✅ Save data to localStorage whenever updated
  useEffect(() => {
    if (response) localStorage.setItem("lectureResponse", JSON.stringify(response));
  }, [response]);

  useEffect(() => {
    if (transcriptSummary) localStorage.setItem("transcriptSummary", transcriptSummary);
  }, [transcriptSummary]);

  useEffect(() => {
    if (quizScores.length > 0) localStorage.setItem("quizScores", JSON.stringify(quizScores));
  }, [quizScores]);

  useEffect(() => {
    localStorage.setItem("languageMode", languageMode);
  }, [languageMode]);

  // ✅ Process video
  const handleProcessVideo = async () => {
    if (!url.trim()) {
      alert("⚠️ Please enter a valid YouTube URL.");
      return;
    }
    try {
      setResponse(null);
      setTranslatedSummary("");
      setTranscriptSummary("");
      localStorage.removeItem("lectureResponse");
      localStorage.removeItem("quizData");
      localStorage.removeItem("quizScores");

      setLoading(true);
      const res = await processVideo(url);
      setResponse(res);
      setDetectedLanguage(res.detected_language || "en");

      if (res.detected_language && res.detected_language !== "en") {
        setLanguageMode("english");
        await handleTranslate("en", res.summary);
      } else {
        setLanguageMode("original");
      }
    } catch (err) {
      console.error("Error processing video:", err);
      alert("❌ Failed to process video. Check backend logs.");
    } finally {
      setLoading(false);
      setTimeout(() => {
        document.getElementById("summary-section")?.scrollIntoView({ behavior: "smooth" });
      }, 300);
    }
  };

  // ✅ Translate summary
  const handleTranslate = async (targetLang, customSummary = null) => {
    const textToTranslate = customSummary || response?.summary;
    if (!textToTranslate) {
      alert("❌ No summary available to translate.");
      return;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/translate-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: textToTranslate, target: targetLang }),
      });

      const data = await res.json();
      if (data.translated_summary) {
        setTranslatedSummary(data.translated_summary);
      } else {
        alert("❌ Failed to translate summary.");
      }
    } catch (error) {
      console.error("Translation error:", error);
      alert("❌ Error translating summary.");
    }
  };

  // ✅ Language toggle
  const handleLanguageToggle = async (lang) => {
    setLanguageMode(lang);
    if (!response?.summary) return;

    if (lang === "english") {
      if (detectedLanguage !== "en") {
        await handleTranslate("en");
      } else {
        setTranslatedSummary(response.summary); // Already English
      }
    }
  };

  // ✅ Regenerate Summary
  const handleGenerateSummary = async () => {
    if (!url.trim()) {
      alert("⚠️ Please enter a valid YouTube URL to regenerate.");
      return;
    }

    setSummaryLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/generate-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: languageMode }),
      });

      const data = await res.json();
      setResponse((prev) => ({ ...prev, summary: data.summary }));

      if (languageMode === "english" && detectedLanguage !== "en") {
        await handleTranslate("en", data.summary);
      }
    } catch (err) {
      console.error("Error regenerating summary:", err);
      alert("❌ Failed to regenerate summary. Check backend logs.");
    } finally {
      setSummaryLoading(false);
    }
  };

  // ✅ Generate Quiz
  const handleGenerateQuiz = async () => {
    if (!response?.summary) {
      alert("⚠️ Please process a video first.");
      return;
    }
    try {
      setQuizLoading(true);
      const quizData = await generateQuiz(translatedSummary || response.summary, difficulty, parseInt(questionCount, 10));

      if (!quizData.quiz || quizData.quiz.length === 0) {
        alert("⚠️ Quiz generation failed. Please try again.");
        return;
      }

      localStorage.setItem("quizData", JSON.stringify(quizData));
      router.push("/quiz");
    } catch (err) {
      console.error("Quiz generation error:", err);
      alert("⚠️ Quiz generation failed. Check backend logs.");
    } finally {
      setQuizLoading(false);
    }
  };

  // ✅ Transcript upload handler
  const handleTranscriptUpload = (e) => {
    if (e.target.files.length > 0) {
      setTranscriptFile(e.target.files[0]);
    }
  };

  const handleSummarizeTranscript = async () => {
    if (!transcriptFile) {
      alert("⚠️ Please upload a transcript file first.");
      return;
    }
    try {
      setSummaryLoading(true);
      const res = await summarizeTranscript(transcriptFile);
      setTranscriptSummary(res.summary || "⚠️ No summary generated. Check transcript content.");
      setTranscriptDetectedLang(res.detected_language || "en");
      setTranscriptLangMode("english"); // Auto-translate to English if not already
    } catch (err) {
      console.error("Error summarizing transcript:", err);
      alert("❌ Failed to summarize transcript.");
    } finally {
      setSummaryLoading(false);
    }
  };

  // ✅ Translate Transcript Summary
  const handleTranslateTranscriptSummary = async (targetLang) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/translate-transcript-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: transcriptSummary, target: targetLang }),
      });
      const data = await res.json();
      setTranslatedTranscriptSummary(data.translated_summary || "");
    } catch (error) {
      console.error("Transcript translation error:", error);
    }
  };

  // ✅ Regenerate Transcript Summary
  const handleRegenerateTranscriptSummary = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/regenerate-transcript-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: transcriptLangMode }),
      });
      const data = await res.json();
      setTranscriptSummary(data.summary);
    } catch (err) {
      console.error("Transcript regenerate error:", err);
    }
  };

  // ✅ Extract keywords for analytics
  useEffect(() => {
    if (response?.summary) {
      const words = response.summary.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
      const freq = {};
      words.forEach((word) => (freq[word] = (freq[word] || 0) + 1));

      const topKeywords = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      setKeywords(topKeywords);
    }
  }, [response]);

  // ✅ Charts for analytics
  useEffect(() => {
    if (typeof window !== "undefined") {
      Chart.getChart("keywordChart")?.destroy();
      Chart.getChart("quizChart")?.destroy();

      if (keywords.length) {
        const ctx = document.getElementById("keywordChart")?.getContext("2d");
        if (ctx) {
          new Chart(ctx, {
            type: "bar",
            data: {
              labels: keywords.map((k) => k[0]),
              datasets: [
                {
                  label: "Keyword Frequency",
                  data: keywords.map((k) => k[1]),
                  backgroundColor: "rgba(79, 70, 229, 0.7)",
                  borderRadius: 8,
                },
              ],
            },
          });
        }
      }

      if (quizScores.length) {
        const ctx = document.getElementById("quizChart")?.getContext("2d");
        if (ctx) {
          new Chart(ctx, {
            type: "line",
            data: {
              labels: quizScores.map((_, i) => `Q${i + 1}`),
              datasets: [
                {
                  label: "Score (%)",
                  data: quizScores,
                  borderColor: "rgba(16, 185, 129, 1)",
                  backgroundColor: "rgba(16, 185, 129, 0.2)",
                  fill: true,
                  tension: 0.4,
                },
              ],
            },
          });
        }
      }
    }
  }, [keywords, quizScores]);

  return (
    <div className={styles.homeContainer}>
      {/* Navbar */}
      <header className={styles.navbar}>
        <div className={styles.navContent}>
          <h2 className={styles.logo}>🎓 AI Lecture Extractor</h2>
          <nav className={styles.navLinks}>
            <a href="#">Home</a>
            <a href="#summary-section">Summary</a>
            <a href="#quiz-section">Quiz</a>
            <a href="#transcript-section">Transcript</a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className={styles.hero}>
        <div className={styles.heroBackground}></div>
        <div className={styles.heroCard}>
          <h1 className={styles.heroTitle}>
            Extract. <span className={styles.gradientText}>Summarize.</span> Quiz. 🚀
          </h1>
          <p className={styles.heroSubtitle}>
            Turn any YouTube lecture into concise notes, download transcripts, and test your knowledge instantly.
          </p>
          <div className={styles.inputSection}>
            <label className={styles.inputLabel}>Enter YouTube URL</label>
            <div className={styles.inputRow}>
              <input
                type="text"
                placeholder="🔗 Paste YouTube URL here..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <button className={styles.primaryBtn} onClick={handleProcessVideo}>
                {loading ? "⏳ Processing..." : "🚀 Process Video"}
              </button>
            </div>
            <small className={styles.helperText}>Paste a valid YouTube link to get started.</small>
          </div>
        </div>
      </main>

      {/* Summary */}
      {response && !loading && (
        <section id="summary-section" className={styles.section}>
          <h2 className={styles.sectionTitle}>📑 Lecture Summary</h2>
          <p className={styles.sectionSubtitle}>Key points extracted from the video:</p>

          {/* Language & Regenerate Row */}
          <div className={styles.languageRow}>
            <div className={styles.languageSelectContainer}>
              <label htmlFor="language-select" className={styles.languageLabel}>
                Choose summary language:
              </label>
              <select
                id="language-select"
                value={languageMode}
                onChange={(e) => handleLanguageToggle(e.target.value)}
                className={styles.languageDropdown}
              >
                <option value="english">English</option>
                <option value="original">Original ({detectedLanguage.toUpperCase()})</option>
              </select>
            </div>

            <button onClick={handleGenerateSummary} className={styles.regenerateBtn}>
              {summaryLoading ? "⏳ Generating..." : "🔄 Regenerate"}
            </button>
          </div>

          <div className={styles.card}>
            <ul className={styles.summaryList}>
              {(languageMode === "english"
                ? (translatedSummary || (detectedLanguage === "en" ? response.summary : ""))
                : response.summary
              )
                ?.split(/[\.\n]/)
                .map((point) => point.replace(/^[✔•*]+/, "").trim())
                .filter(
                  (point) =>
                    point.length > 0 &&
                    !point.toLowerCase().startsWith("if you would like me") &&
                    !point.toLowerCase().startsWith("here is a summary")
                )
                .map((point, idx) => (
                  <li key={idx}>{point}</li>
                ))}
            </ul>

            <div className={styles.downloadButtons}>
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL}/download-pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.downloadBtn}
              >
                📥 Download Notes (PDF)
              </a>
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL}/download-transcript`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.downloadBtn}
              >
                📝 Download Transcript
              </a>
            </div>
          </div>
        </section>
      )}

     {/* Transcript Upload */}
<section id="transcript-section" className={styles.transcriptSection}>
  <div className={styles.transcriptContainer}>
    <h2 className={styles.transcriptTitle}>📂 Upload Transcript for Summary</h2>
    <p className={styles.transcriptSubtitle}>
      Upload a transcript file (.txt) and get an AI-generated summary instantly.
    </p>
    <label htmlFor="transcriptUpload" className={styles.fileInputLabel}>
      Select Transcript File:
    </label>
    <input
      type="file"
      id="transcriptUpload"
      accept=".txt"
      className={styles.fileInput}
      onChange={handleTranscriptUpload}
    />
    <button onClick={handleSummarizeTranscript} className={styles.summaryBtn}>
      {summaryLoading ? "⏳ Summarizing..." : "📝 Get Summary"}
    </button>

    {transcriptSummary && (
      <div className={styles.summaryBox}>
        <div className={styles.languageRow}>
          <label>Choose Transcript Summary Language:</label>
          <select
            value={transcriptLangMode}
            onChange={async (e) => {
              const newLang = e.target.value;
              setTranscriptLangMode(newLang);
              if (newLang === "english" && transcriptDetectedLang !== "en") {
                await handleTranslateTranscriptSummary("en");
              }
            }}
            className={styles.languageDropdown}
          >
            <option value="english">English</option>
            <option value="original">Original ({transcriptDetectedLang.toUpperCase()})</option>
          </select>
          <button onClick={handleRegenerateTranscriptSummary} className={styles.regenerateBtn}>
            🔄 Regenerate
          </button>
        </div>

        <ul className={styles.summaryList}>
          {(transcriptLangMode === "english"
            ? translatedTranscriptSummary || (transcriptDetectedLang === "en" ? transcriptSummary : "")
            : transcriptSummary
          )
            .split(/[\.\n]/)
            .map((point) => point.replace(/^[✔•*]+/, "").trim())
            .filter((point) => point.length > 0)
            .map((point, idx) => (
              <li key={idx}>{point}</li>
            ))}
        </ul>

        <div className={styles.downloadButtons}>
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL}/download-transcript-summary`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.downloadBtn}
          >
            📥 Download Transcript Summary (PDF)
          </a>
        </div>
      </div>
    )}
  </div>
</section>


      {/* Quiz */}
      {response && (
        <section id="quiz-section" className={styles.section}>
          <h2 className={styles.sectionTitle}>🧠 Generate Quiz</h2>
          <p className={styles.sectionSubtitle}>Test your understanding with an AI-generated quiz based on this lecture.</p>
          <div className={styles.card}>
            <div className={styles.quizOptions}>
              <div className={styles.field}>
                <label>Difficulty</label>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div className={styles.field}>
                <label>Number of Questions</label>
                <input type="number" value={questionCount} onChange={(e) => setQuestionCount(e.target.value)} min="1" max="15" />
              </div>
            </div>
            <button onClick={handleGenerateQuiz} className={styles.secondaryBtn}>
              {quizLoading ? "⚡ Generating Quiz..." : "🎯 Generate Quiz"}
            </button>
          </div>
        </section>
      )}

      {/* Learning Insights */}
{(keywords.length > 0 || quizScores.length > 0) && (
  <section id="analytics-section" className={styles.analyticsSection}>
    <h2 className={styles.sectionTitle}>📊 Learning Insights & Progress Tracking</h2>
    <p className={styles.sectionSubtitle}>
      Monitor your learning journey with keyword frequency analysis and quiz performance trends to identify strengths and focus areas.
    </p>
    <div className={styles.analyticsGrid}>
      {keywords.length > 0 && (
        <div className={styles.analyticsCard}>
          <h3>🔑 Key Concepts Covered</h3>
          <p className={styles.analyticsDescription}>
            Frequently mentioned topics extracted from your lecture summary.
          </p>
          <canvas id="keywordChart"></canvas>
        </div>
      )}
      {quizScores.length > 0 && (
        <div className={styles.analyticsCard}>
          <h3>🎯 Quiz Performance Trend</h3>
          <p className={styles.analyticsDescription}>
            Track your quiz scores to evaluate knowledge retention and improvement over time.
          </p>
          <canvas id="quizChart"></canvas>
        </div>
      )}
    </div>
  </section>
)}


      {/* Footer */}
      <footer className={styles.footer}>
        © {new Date().getFullYear()} AI Lecture Extractor. All Rights Reserved.
      </footer>
    </div>
  );
}
