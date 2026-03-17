import { Navigate, Route, Routes } from "react-router-dom";
import { Header } from "./components/Header";
import { BoardPage } from "./components/BoardPage";
import { ArchivePage } from "./components/ArchivePage";
import { SessionPage } from "./components/SessionPage";

export function App() {
  return (
    <div className="app-shell">
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<BoardPage />} />
          <Route path="/archive" element={<ArchivePage />} />
          <Route path="/session/:sessionId" element={<SessionPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
