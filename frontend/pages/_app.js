import '../styles/Home.module.css';
import '../styles/Quiz.module.css';
import "../styles/globals.css";



function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />;
}

// ✅ Fix for compatibility (avoids getInitialProps warning in Next.js 15+)
MyApp.getInitialProps = async () => ({ pageProps: {} });

export default MyApp;
