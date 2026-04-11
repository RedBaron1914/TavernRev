import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DebugConsole } from "./components/DebugConsole";
import "./App.css";
import "./services/Logger"; // Init logger

const isConsoleWindow = new URLSearchParams(window.location.search).get("view") === "console";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: "" };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error: error.toString() };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 20,
            color: "red",
            background: "#1a1a1a",
            height: "100vh",
          }}
        >
          <h1>Something went wrong.</h1>
          <pre>{this.state.error}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {isConsoleWindow ? <DebugConsole standalone /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>,
);
