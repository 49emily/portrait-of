// src/App.jsx
import { Routes, Route } from "react-router-dom";
import HomePage from "./HomePage";
import FriendsPage from "./FriendsPage";
import "./App.css";

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/friends" element={<FriendsPage />} />
    </Routes>
  );
}

export default App;
