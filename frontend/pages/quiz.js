import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import styles from "../styles/Quiz.module.css";

export default function Quiz() {
  const router = useRouter();
  const [quiz, setQuiz] = useState([]);
  const [suggestions, setSuggestions] = useState({ articles: [], videos: [] });
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [score, setScore] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [answers, setAnswers] = useState([]);
  const [timeLeft, setTimeLeft] = useState(60);

  // ✅ Load quiz data from localStorage
  useEffect(() => {
    const storedQuiz = localStorage.getItem("quizData");
    if (storedQuiz) {
      try {
        const parsed = JSON.parse(storedQuiz);
        if (parsed.quiz && Array.isArray(parsed.quiz)) setQuiz(parsed.quiz);
        if (parsed.suggestions) setSuggestions(parsed.suggestions); // ✅ Expecting {articles:[], videos:[]}
      } catch (err) {
        console.error("Invalid quiz data", err);
      }
    } else {
      alert("⚠️ No quiz data found. Please go back and generate a quiz again.");
      router.push("/");
    }
  }, []);

  // ✅ Timer Logic
  useEffect(() => {
    if (!submitted && quiz.length > 0) {
      if (timeLeft === 0) {
        handleNext();
        return;
      }
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft, submitted, quiz]);

  const handleOptionSelect = (option) => setSelectedOption(option);

  const handleNext = () => {
    if (!selectedOption) {
      alert("⚠️ Please select an option before proceeding!");
      return;
    }

    const updatedAnswers = [
      ...answers,
      {
        question: quiz[currentQuestion].question,
        selected: selectedOption,
        correct: quiz[currentQuestion].answer,
      },
    ];
    setAnswers(updatedAnswers);

    if (selectedOption === quiz[currentQuestion].answer) {
      setScore((prev) => prev + 1);
    }

    if (currentQuestion < quiz.length - 1) {
      setCurrentQuestion((prev) => prev + 1);
      setSelectedOption(null);
      setTimeLeft(60);
    } else {
      setSubmitted(true);
      const finalScore =
        score + (selectedOption === quiz[currentQuestion].answer ? 1 : 0);
      const accuracy = quiz.length > 0 ? (finalScore / quiz.length) * 100 : 0;

      const existingScores = JSON.parse(localStorage.getItem("quizScores")) || [];
      localStorage.setItem(
        "quizScores",
        JSON.stringify([...existingScores, accuracy.toFixed(2)])
      );
    }
  };

  const accuracy = quiz.length > 0 ? ((score / quiz.length) * 100).toFixed(2) : 0;

  if (!quiz || quiz.length === 0) {
    return (
      <p className={styles.loading}>
        ⚠️ No quiz data found. Please go back and generate a quiz again.
      </p>
    );
  }

  return (
    <div className={styles.quizContainer}>
      {!submitted ? (
        <>
          <h1 className={styles.quizTitle}>🧠 AI Quiz Generator</h1>
          <p className={styles.questionCounter}>
            Question {currentQuestion + 1} of {quiz.length}
          </p>
          <p className={styles.timer}>⏱ Time Left: {timeLeft}s</p>

          <div className={styles.questionBox}>
            <h2 className={styles.question}>{quiz[currentQuestion].question}</h2>
            <div className={styles.optionsGrid}>
              {quiz[currentQuestion].options.map((option, idx) => (
                <button
                  key={idx}
                  className={`${styles.option} ${
                    selectedOption === option ? styles.selected : ""
                  }`}
                  onClick={() => handleOptionSelect(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <button className={styles.nextButton} onClick={handleNext}>
            {currentQuestion < quiz.length - 1 ? "Next ➡️" : "Submit ✅"}
          </button>
        </>
      ) : (
        <div className={styles.resultBox}>
          <h2 className={styles.resultTitle}>🎉 Quiz Completed!</h2>
          <p className={styles.score}>
            Your Score: <span>{score}</span> / {quiz.length}
          </p>
          <p className={styles.accuracy}>✅ Accuracy: {accuracy}%</p>

          {/* ✅ Correct Answers Review */}
          <div className={styles.answerReview}>
            <h3>📌 Correct Answers Review</h3>
            <ul>
              {answers.map((ans, idx) => (
                <li key={idx} className={styles.answerItem}>
                  <strong>Q{idx + 1}:</strong> {ans.question} <br />
                  <span>✅ Correct: {ans.correct}</span> <br />
                  <span
                    className={
                      ans.selected === ans.correct ? styles.correct : styles.wrong
                    }
                  >
                    Your Answer: {ans.selected}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* ✅ Suggested Study Resources */}
          {suggestions.articles.length > 0 && (
            <>
              <h3 className={styles.studyTitle}>📚 Suggested Articles</h3>
              <ul className={styles.studyList}>
                {suggestions.articles.map((a, idx) => (
                  <li key={idx}>
                    <a href={a.link} target="_blank" rel="noopener noreferrer">
                      {a.topic}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}

          {suggestions.videos.length > 0 && (
            <>
              <h3 className={styles.studyTitle}>🎥 Suggested Videos</h3>
              <ul className={styles.studyList}>
                {suggestions.videos.map((v, idx) => (
                  <li key={idx}>
                    <a href={v.url} target="_blank" rel="noopener noreferrer">
                      {v.title}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}

          <button className={styles.backButton} onClick={() => router.push("/")}>
            🔄 Back to Home
          </button>
        </div>
      )}
    </div>
  );
}
