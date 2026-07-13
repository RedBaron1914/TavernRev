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
            height: "100dvh",
          }}
        >
          <h1>{i18next.t('somethingWentWrong', 'Something went wrong.')}</h1>
          <pre>{this.state.error}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}

import { I18nextProvider } from "react-i18next";
import i18n, { initI18n } from "./i18n";
import i18next from 'i18next'

async function renderApp() {
  await initI18n();

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <I18nextProvider i18n={i18n}>
        <ErrorBoundary>
          {isConsoleWindow ? <DebugConsole standalone /> : <App />}
        </ErrorBoundary>
      </I18nextProvider>
    </React.StrictMode>,
  );
}

void renderApp();
