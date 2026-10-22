import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App.jsx";
import { createQueryClient } from "./lib/queryClient";
import ErrorBoundary from "./components/app/ErrorBoundary";
import { installErrorReporting } from "./lib/errorReporting";

installErrorReporting();

// module scope: re-renders never recreate the client (and wipe the cache)
const queryClient = createQueryClient();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
