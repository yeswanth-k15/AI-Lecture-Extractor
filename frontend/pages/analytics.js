import { useEffect, useState } from "react";
import { fetchAnalytics, openAnalyticsDashboard } from "../utils/api";
import styles from "../styles/Home.module.css";

export default function Analytics() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getAnalytics = async () => {
      try {
        const data = await fetchAnalytics();
        setAnalytics(data);
      } catch (error) {
        console.error("❌ Error fetching analytics:", error);
      } finally {
        setLoading(false);
      }
    };
    getAnalytics();
  }, []);

  return (
    <div className={styles.homeContainer}>
      <header className={styles.header}>
        <h1>📊 AI-Powered Learning Analytics</h1>
        <p className={styles.sectionSubtitle}>
          Visualize your study progress with detailed insights on summaries, quizzes, and topic focus.
        </p>
      </header>

      {loading ? (
        <p>⏳ Loading analytics...</p>
      ) : analytics ? (
        <div className={styles.card}>
          <h2>📈 Dashboard Overview</h2>
          <ul>
            <li>✅ <b>Total Videos Processed:</b> {analytics.total_videos || 0}</li>
            <li>📝 <b>Summaries Generated:</b> {analytics.total_summaries || 0}</li>
            <li>🎯 <b>Quizzes Created:</b> {analytics.total_quizzes || 0}</li>
            <li>📂 <b>Most Recent Lecture:</b> {analytics.recent_video || "N/A"}</li>
          </ul>

          <h3>🔥 Learning Metrics</h3>
          <ul>
            <li>🔑 <b>Top Keywords:</b> {analytics.top_keywords?.join(", ") || "N/A"}</li>
            <li>📉 <b>Average Quiz Score:</b> {analytics.avg_quiz_score || "N/A"}%</li>
            <li>📈 <b>Improvement Rate:</b> {analytics.improvement_rate || "N/A"}%</li>
          </ul>

          <button className={styles.secondaryBtn} onClick={openAnalyticsDashboard}>
            🔍 Open Interactive Dashboard
          </button>
        </div>
      ) : (
        <p>⚠️ No analytics data available. Process some videos and take quizzes to see insights!</p>
      )}
    </div>
  );
}
