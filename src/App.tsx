import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import Game from "./screens/Game";
import Home from "./screens/Home";
import Lobby from "./screens/Lobby";
import { GAME_PATH_PATTERN, HOME_PATH, LOBBY_PATH } from "./utils/navigation";

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Navigate to={HOME_PATH} replace />} />
        <Route path={HOME_PATH} element={<Home />} />
        <Route path={LOBBY_PATH} element={<Lobby />} />
        <Route path={GAME_PATH_PATTERN} element={<Game />} />
        <Route path="*" element={<Navigate to={HOME_PATH} replace />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
